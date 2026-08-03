import crypto from "crypto";
import prisma from "../../prisma";
import { encryptPrintboxSecret, decryptPrintboxSecret } from "./printbox.crypto";
import { dynsecCommand } from "./mqttAdmin.client";

// Rol dynamic-security compartido por todo tenant (creado una sola vez, ver
// printbox/broker/bootstrap.sh). Su ACL usa el patron tenants/%u/devices/+/jobs
// -- %u se sustituye por el username MQTT del que se conecta, asi que un
// tenant nunca puede suscribirse al topic de otro aunque el codigo de la
// app tenga un bug: el broker mismo se lo impide.
const TENANT_ROLE_NAME = "printbox-tenant-device";

/**
 * Devuelve las credenciales MQTT del tenant, creandolas (usuario dynsec +
 * fila en Tenant) la primera vez que hace falta -- normalmente durante el
 * pairing del primer PrintboxDevice de ese tenant.
 */
export async function ensureTenantMqttCredentials(tenantId: string) {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });

  if (tenant.printboxMqttUsername && tenant.printboxMqttPasswordEncrypted) {
    return {
      username: tenant.printboxMqttUsername,
      password: decryptPrintboxSecret(tenant.printboxMqttPasswordEncrypted),
    };
  }

  const username = `tenant-${tenant.slug}`;
  const password = crypto.randomBytes(24).toString("hex");

  await dynsecCommand([
    { command: "createClient", username, password, textName: `PrintBox — ${tenant.name}` },
    { command: "addClientRole", username, rolename: TENANT_ROLE_NAME },
  ]);

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      printboxMqttUsername: username,
      printboxMqttPasswordEncrypted: encryptPrintboxSecret(password),
    },
  });

  return { username, password };
}
