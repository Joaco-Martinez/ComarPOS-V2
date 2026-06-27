/**
 * Servicio de configuracion ARCA.
 * Logica extraida a sub-modulos para reducir la superficie de cambio:
 *   - arcaConfig/arcaConfig.helpers.ts     → tipos + validaciones + getConfig
 *   - arcaConfig/arcaConfig.core.ts        → CRUD config, CSR, certificados, activacion
 *   - arcaConfig/arcaConfig.pointsOfSale.ts → puntos de venta
 *   - arcaConfig/arcaConfig.remitoCai.ts    → CAI de remitos
 *   - arcaConfig/arcaConfig.audit.ts        → auditoria y estado de salud
 *
 * Este archivo es el unico punto de entrada al exterior (doc seccion 4).
 */
import {
  getConfig,
  list,
  getActive,
  getActiveDecrypted,
  create,
  upsertConfig,
  generateCsr,
  downloadCsr,
  uploadCertificate,
  uploadCertificates,
  deleteCertificates,
  activate,
  remove,
} from "./arcaConfig/arcaConfig.core";
import { listPointsOfSale, upsertPointOfSale, deletePointOfSale } from "./arcaConfig/arcaConfig.pointsOfSale";
import { listRemitoCais, upsertRemitoCai, deleteRemitoCai } from "./arcaConfig/arcaConfig.remitoCai";
import { listAuditLogs, audit, markError, markChecked } from "./arcaConfig/arcaConfig.audit";

export const arcaConfigService = {
  list,
  getConfig,
  getActive,
  getActiveDecrypted,
  create,
  upsertConfig,
  generateCsr,
  downloadCsr,
  uploadCertificate,
  uploadCertificates,
  deleteCertificates,
  activate,
  remove,
  listPointsOfSale,
  upsertPointOfSale,
  deletePointOfSale,
  listRemitoCais,
  upsertRemitoCai,
  deleteRemitoCai,
  listAuditLogs,
  audit,
  markError,
  markChecked,
};
