/**
 * CRUD de configuracion ARCA, generacion de CSR, carga de certificados y activacion.
 * Extraido de arcaConfig.service.ts (doc seccion 4 - modularizacion).
 */
import forge from "node-forge";
import prisma from "../../prisma";
import { arcaCryptoService } from "../arcaCrypto.service";
import {
  normalizeCuit,
  toNullableDate,
  toNullableNumber,
  cleanObject,
  decryptRequired,
  assertValidCuit,
  getCertExpiration,
  validatePrivateKey,
  buildCsrSubject,
  getConfig,
  type UpdateArcaConfigInput,
  type GenerateCsrInput,
} from "./arcaConfig.helpers";
import { upsertPointOfSale } from "./arcaConfig.pointsOfSale";
import { businessLocationService } from "../businessLocation.service";
import { tenantScope } from "../../utils/tenantScope";
import { currentTenantId } from "../../context/tenantContext";

export { getConfig };

async function ensureDefaultBusinessLocation() {
  const existingCount = await prisma.businessLocation.count({ where: { ...tenantScope() } });
  if (existingCount > 0) return;

  await businessLocationService.create({ name: "Casa Central", isDefault: true });
}

export async function list() {
  return prisma.arcaConfig.findMany({
    where: { ...tenantScope() },
    include: {
      pointsOfSale: true,
      tokens: true,
      remitoCais: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getActive() {
  const config = await prisma.arcaConfig.findFirst({
    where: { isActive: true, ...tenantScope() },
    include: { pointsOfSale: true },
    orderBy: { createdAt: "desc" },
  });

  if (!config) throw new Error("No hay configuración ARCA activa.");
  return config;
}

export async function getActiveDecrypted() {
  const config = await prisma.arcaConfig.findFirst({
    where: { isActive: true, ...tenantScope() },
    include: { pointsOfSale: true },
    orderBy: { createdAt: "desc" },
  });

  if (!config) throw new Error("No hay configuración ARCA activa.");

  return {
    ...config,
    certPem: decryptRequired(config.certEncrypted, "el certificado"),
    keyPem: decryptRequired(config.keyEncrypted, "la private key"),
  };
}

export async function create(data: UpdateArcaConfigInput) {
  const config = await upsertConfig(data);

  if (data.certPem && data.keyPem) {
    return uploadCertificates({
      certPem: data.certPem,
      keyPem: data.keyPem,
      certExpiresAt: data.certExpiresAt,
    });
  }

  return config;
}

export async function upsertConfig(data: UpdateArcaConfigInput) {
  const existing = await prisma.arcaConfig.findFirst({
    where: { ...tenantScope() },
    orderBy: { createdAt: "desc" },
  });

  const cuit = data.cuit ? normalizeCuit(data.cuit) : undefined;
  const activityStartValue = data.activityStart ?? data.activityStartDate;
  const defaultPointOfSale = toNullableNumber(data.defaultPointOfSale ?? data.pointOfSale);
  const defaultConcept = toNullableNumber(data.defaultConcept);

  if (cuit !== undefined && cuit !== "") assertValidCuit(cuit);

  const payload = cleanObject({
    businessName: data.businessName,
    cuit,
    ivaCondition: data.ivaCondition ?? undefined,
    fiscalAddress: data.fiscalAddress ?? undefined,
    iibb: data.iibb ?? undefined,
    activityStart:
      activityStartValue !== undefined ? toNullableDate(activityStartValue) : undefined,
    environment: data.environment,
    defaultPointOfSale: defaultPointOfSale ?? undefined,
    defaultCurrencyId: data.defaultCurrencyId ?? undefined,
    defaultConcept: defaultConcept ?? undefined,
    status: data.status ?? "INACTIVE",
  });

  let config;

  if (existing) {
    config = await prisma.arcaConfig.update({
      where: { id: existing.id },
      data: payload,
      include: { pointsOfSale: true, tokens: true, remitoCais: true },
    });
  } else {
    config = await prisma.arcaConfig.create({
      data: {
        // "scope" es @unique en el modelo (legado pre-multi-tenant); para que un
        // tenant nuevo pueda crear su propia config sin colisionar con la de
        // "GRUPO_VJ" se usa su tenantId como scope (doc seccion 6).
        scope: currentTenantId() ? `TENANT_${currentTenantId()}` : "GRUPO_VJ",
        tenantId: currentTenantId(),
        businessName: data.businessName || "Mi Negocio",
        cuit: cuit || "",
        ivaCondition: data.ivaCondition || null,
        fiscalAddress: data.fiscalAddress || null,
        iibb: data.iibb || null,
        activityStart: toNullableDate(activityStartValue),
        environment: data.environment || "HOMOLOGACION",
        defaultPointOfSale,
        defaultCurrencyId: data.defaultCurrencyId || "PES",
        defaultConcept: defaultConcept || 1,
        status: data.status || "INACTIVE",
        isActive: false,
      },
      include: { pointsOfSale: true, tokens: true, remitoCais: true },
    });

    // Primera vez que este tenant carga datos fiscales -- si todavia no
    // tiene ninguna sucursal/deposito, le creamos una por defecto para que
    // no tenga que pasar por Configuracion > Sucursales antes de poder
    // vender (puede crear mas despues, sujeto al limite de su plan). No
    // bloquea el guardado de ARCA si falla por cualquier motivo.
    await ensureDefaultBusinessLocation().catch((err) => {
      console.error("No se pudo crear la sucursal por defecto tras configurar ARCA:", err);
    });
  }

  if (defaultPointOfSale && defaultPointOfSale > 0) {
    await upsertPointOfSale({
      number: defaultPointOfSale,
      description: "Punto de venta principal",
      enabled: true,
      isDefault: true,
    });
  }

  return prisma.arcaConfig.findUnique({
    where: { id: config.id },
    include: { pointsOfSale: true, tokens: true, remitoCais: true },
  });
}

export async function generateCsr(data: GenerateCsrInput) {
  const cuit = normalizeCuit(data.cuit);
  assertValidCuit(cuit);

  if (!data.businessName?.trim()) {
    throw new Error("La razón social es obligatoria para generar el CSR.");
  }

  const point = toNullableNumber(data.defaultPointOfSale ?? data.pointOfSale);
  if (!point || point <= 0) {
    throw new Error("El punto de venta es obligatorio para configurar ARCA.");
  }

  const config = await upsertConfig({
    ...data,
    cuit,
    defaultPointOfSale: point,
    status: "INCOMPLETE",
  });

  if (!config) {
    throw new Error("No se pudo crear la configuración ARCA.");
  }

  const keyPair = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });

  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = keyPair.publicKey;
  csr.setSubject(
    buildCsrSubject({
      businessName: data.businessName.trim(),
      cuit,
      certAlias: data.certAlias || "COMARPOS",
    })
  );
  csr.sign(keyPair.privateKey, forge.md.sha256.create());

  if (!csr.verify()) {
    throw new Error("No se pudo generar correctamente el pedido CSR.");
  }

  const privateKeyPem = forge.pki.privateKeyToPem(keyPair.privateKey);
  const csrPem = forge.pki.certificationRequestToPem(csr);

  await prisma.afipToken.deleteMany({ where: { arcaConfigId: config.id } });

  return prisma.arcaConfig.update({
    where: { id: config.id },
    data: {
      keyEncrypted: arcaCryptoService.encrypt(privateKeyPem),
      csrEncrypted: arcaCryptoService.encrypt(csrPem),
      csrGeneratedAt: new Date(),
      certEncrypted: null,
      certExpiresAt: null,
      certAlias: data.certAlias || "COMARPOS",
      status: "INCOMPLETE",
      isActive: false,
      lastError: null,
      lastTokenAt: null,
      lastCheckAt: null,
      lastSuccessAt: null,
    },
    include: { pointsOfSale: true, tokens: true, remitoCais: true },
  });
}

export async function downloadCsr(configId?: string) {
  const config = configId
    ? await prisma.arcaConfig.findFirst({ where: { id: configId, ...tenantScope() } })
    : await prisma.arcaConfig.findFirst({ where: { ...tenantScope() }, orderBy: { createdAt: "desc" } });

  if (!config) throw new Error("No hay configuración ARCA creada.");
  if (!config.csrEncrypted) {
    throw new Error("Todavía no se generó el pedido CSR.");
  }

  return {
    filename: `pedido-arca-${config.cuit || "sin-cuit"}.csr`,
    content: arcaCryptoService.decrypt(config.csrEncrypted),
  };
}

export async function uploadCertificate(params: {
  certPem: string;
  certExpiresAt?: string | Date | null;
}) {
  const config = await getConfig();
  if (!config) throw new Error("Primero tenés que crear la configuración ARCA.");
  if (!config.keyEncrypted) {
    throw new Error("Primero generá el pedido CSR desde el sistema.");
  }

  const certExpiresAt = params.certExpiresAt
    ? toNullableDate(params.certExpiresAt)
    : getCertExpiration(params.certPem);

  await prisma.afipToken.deleteMany({ where: { arcaConfigId: config.id } });

  return prisma.arcaConfig.update({
    where: { id: config.id },
    data: {
      certEncrypted: arcaCryptoService.encrypt(params.certPem),
      certExpiresAt,
      status: "INCOMPLETE",
      isActive: false,
      lastError: null,
      lastTokenAt: null,
    },
    include: { pointsOfSale: true, tokens: true, remitoCais: true },
  });
}

export async function uploadCertificates(params: {
  certPem: string;
  keyPem?: string;
  certExpiresAt?: string | Date | null;
}) {
  const config = await getConfig();
  if (!config) throw new Error("Primero tenés que crear la configuración ARCA.");

  const certExpiresAt = params.certExpiresAt
    ? toNullableDate(params.certExpiresAt)
    : getCertExpiration(params.certPem);

  const data: any = {
    certEncrypted: arcaCryptoService.encrypt(params.certPem),
    certExpiresAt,
    status: "INCOMPLETE",
    isActive: false,
    lastError: null,
    lastTokenAt: null,
  };

  if (params.keyPem) {
    validatePrivateKey(params.keyPem);
    data.keyEncrypted = arcaCryptoService.encrypt(params.keyPem);
  } else if (!config.keyEncrypted) {
    throw new Error("Falta la private key. Usá primero 'Generar CSR' o subí la .key.");
  }

  await prisma.afipToken.deleteMany({ where: { arcaConfigId: config.id } });

  return prisma.arcaConfig.update({
    where: { id: config.id },
    data,
    include: { pointsOfSale: true, tokens: true, remitoCais: true },
  });
}

export async function deleteCertificates() {
  const config = await getConfig();
  if (!config) throw new Error("No hay configuración ARCA creada.");

  await prisma.afipToken.deleteMany({ where: { arcaConfigId: config.id } });

  return prisma.arcaConfig.update({
    where: { id: config.id },
    data: {
      certEncrypted: null,
      keyEncrypted: null,
      csrEncrypted: null,
      csrGeneratedAt: null,
      certExpiresAt: null,
      lastTokenAt: null,
      status: "INCOMPLETE",
      isActive: false,
    },
    include: { pointsOfSale: true, tokens: true, remitoCais: true },
  });
}

export async function activate(configId?: string) {
  const config = configId
    ? await prisma.arcaConfig.findFirst({ where: { id: configId, ...tenantScope() } })
    : await prisma.arcaConfig.findFirst({ where: { ...tenantScope() }, orderBy: { createdAt: "desc" } });

  if (!config) throw new Error("No hay configuración ARCA para activar.");
  if (!config.cuit) throw new Error("Falta configurar el CUIT.");
  if (!config.certEncrypted) throw new Error("Falta cargar el certificado .crt que devuelve ARCA.");
  if (!config.keyEncrypted) throw new Error("Falta la private key. Generá el CSR desde el sistema.");

  const pointsCount = await prisma.arcaPointOfSale.count({
    where: { arcaConfigId: config.id, enabled: true },
  });

  if (pointsCount === 0) throw new Error("Falta configurar al menos un punto de venta.");

  await prisma.arcaConfig.updateMany({
    where: { ...tenantScope() },
    data: { isActive: false },
  });

  return prisma.arcaConfig.update({
    where: { id: config.id },
    data: { isActive: true, status: "ACTIVE", lastError: null },
    include: { pointsOfSale: true, tokens: true, remitoCais: true },
  });
}

export async function remove(id: string) {
  const config = await prisma.arcaConfig.findFirst({ where: { id, ...tenantScope() } });
  if (!config) throw new Error("Configuración ARCA no encontrada.");

  await prisma.afipToken.deleteMany({ where: { arcaConfigId: id } });
  await prisma.arcaPointOfSale.deleteMany({ where: { arcaConfigId: id } });
  await prisma.remitoCaiConfig.deleteMany({ where: { arcaConfigId: id } });
  await prisma.arcaAuditLog.deleteMany({ where: { arcaConfigId: id } });
  await prisma.arcaConfig.delete({ where: { id } });

  return { ok: true };
}
