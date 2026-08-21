import { Router } from "express";
import multer from "multer";
import { arcaConfigController } from "../controllers/arcaConfig.controller";
import { authMiddleware, requireAnyRole } from "../middleware/auth";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

const certificateUpload = upload.fields([
  { name: "cert", maxCount: 1 },
  { name: "certificate", maxCount: 1 },
  { name: "certPem", maxCount: 1 },
  { name: "key", maxCount: 1 },
  { name: "privateKey", maxCount: 1 },
  { name: "keyPem", maxCount: 1 },
]);

// authMiddleware/requireAnyRole se aplican por ruta (no con router.use() al
// tope) a proposito: en las rutas con certificateUpload (multer), tienen que
// correr DESPUES de multer o se pierde el contexto de tenant que arma
// authMiddleware (AsyncLocalStorage, ver src/context/tenantContext.ts) -
// mismo caso que product.routes.ts / tenantLogo.routes.ts.
const auth = [authMiddleware, requireAnyRole(["ADMIN", "CONTADOR"])];

router.get("/", ...auth, arcaConfigController.get);
router.get("/all", ...auth, arcaConfigController.list);
router.get("/config", ...auth, arcaConfigController.get);
router.put("/config", ...auth, arcaConfigController.upsert);

/**
 * Flujo fácil:
 * 1) POST /arca-config/generate-csr
 * 2) GET  /arca-config/:id/download-csr
 * 3) POST /arca-config/:id/upload-cert
 */
router.post("/generate-csr", ...auth, arcaConfigController.generateCsr);
router.get("/:id/download-csr", ...auth, arcaConfigController.downloadCsr);
router.get("/download-csr", ...auth, arcaConfigController.downloadCsr);
router.post("/:id/upload-cert", certificateUpload, ...auth, arcaConfigController.uploadCertificate);
router.post("/upload-cert", certificateUpload, ...auth, arcaConfigController.uploadCertificate);

// Flujo viejo compatible: subir .crt + .key manualmente.
router.post("/", certificateUpload, ...auth, arcaConfigController.create);
router.post("/certificados", certificateUpload, ...auth, arcaConfigController.uploadCertificates);
router.post("/certificates", certificateUpload, ...auth, arcaConfigController.uploadCertificates);
router.delete("/certificados", ...auth, arcaConfigController.deleteCertificates);
router.delete("/certificates", ...auth, arcaConfigController.deleteCertificates);

router.patch("/:id/activate", ...auth, arcaConfigController.activate);
router.patch("/activate", ...auth, arcaConfigController.activate);
router.post("/:id/test", ...auth, arcaConfigController.test);
router.post("/test/wsaa", ...auth, arcaConfigController.testWsaa);
router.post("/test/wsfe-dummy", ...auth, arcaConfigController.testWsfeDummy);

router.get("/puntos-venta", ...auth, arcaConfigController.listPointsOfSale);
router.get("/points-of-sale", ...auth, arcaConfigController.listPointsOfSale);
router.post("/puntos-venta", ...auth, arcaConfigController.upsertPointOfSale);
router.post("/points-of-sale", ...auth, arcaConfigController.upsertPointOfSale);
router.delete("/puntos-venta/:id", ...auth, arcaConfigController.deletePointOfSale);
router.delete("/points-of-sale/:id", ...auth, arcaConfigController.deletePointOfSale);

router.get("/remitos-cai", ...auth, arcaConfigController.listRemitoCais);
router.post("/remitos-cai", ...auth, arcaConfigController.upsertRemitoCai);
router.put("/remitos-cai/:id", ...auth, arcaConfigController.upsertRemitoCai);
router.delete("/remitos-cai/:id", ...auth, arcaConfigController.deleteRemitoCai);


router.get("/auditoria", ...auth, arcaConfigController.listAuditLogs);
router.get("/audit", ...auth, arcaConfigController.listAuditLogs);

router.delete("/:id", ...auth, arcaConfigController.remove);

export default router;
