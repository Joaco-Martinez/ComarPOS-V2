import { Request, Response, NextFunction } from "express";
import { arcaConfigService } from "../services/arcaConfig.service";
import { generarTokenAFIP } from "../afip/wsaa.service";
import { getParamAsString } from "../utils/params";

function getFiles(req: Request) {
  return req.files as Record<string, Express.Multer.File[]> | undefined;
}

function fileText(file?: Express.Multer.File) {
  return file?.buffer?.toString("utf8");
}

function pickCertificateFiles(req: Request) {
  const files = getFiles(req);
  const certFile = files?.cert?.[0] || files?.certificate?.[0] || files?.certPem?.[0];
  const keyFile = files?.key?.[0] || files?.privateKey?.[0] || files?.keyPem?.[0];

  return {
    certPem: fileText(certFile) || req.body.certPem || req.body.certificate,
    keyPem: fileText(keyFile) || req.body.keyPem || req.body.privateKey,
  };
}

function pickOnlyCertificate(req: Request) {
  const files = getFiles(req);
  const certFile = files?.cert?.[0] || files?.certificate?.[0] || files?.certPem?.[0];

  return fileText(certFile) || req.body.certPem || req.body.certificate;
}

export const arcaConfigController = {
  async list(_req: Request, res: Response, next: NextFunction) {
    try {
      const configs = await arcaConfigService.list();
      res.json({ ok: true, content: configs });
    } catch (error) {
      next(error);
    }
  },

  async get(_req: Request, res: Response, next: NextFunction) {
    try {
      const config = await arcaConfigService.getConfig();
      res.json({ ok: true, content: config });
    } catch (error) {
      next(error);
    }
  },

  async upsert(req: Request, res: Response, next: NextFunction) {
    try {
      const config = await arcaConfigService.upsertConfig(req.body);
      res.json({ ok: true, content: config });
    } catch (error) {
      next(error);
    }
  },

  async generateCsr(req: Request, res: Response, next: NextFunction) {
    try {
      const config = await arcaConfigService.generateCsr(req.body);

      res.status(201).json({
        ok: true,
        content: config,
        message:
          "CSR generado correctamente. Descargalo y subilo en ARCA para obtener el certificado .crt.",
      });
    } catch (error) {
      next(error);
    }
  },

  async downloadCsr(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id ? getParamAsString(req.params.id, "id") : undefined;
      const csr = await arcaConfigService.downloadCsr(id);

      res.setHeader("Content-Type", "application/pkcs10");
      res.setHeader("Content-Disposition", `attachment; filename="${csr.filename}"`);
      res.send(csr.content);
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { certPem, keyPem } = pickCertificateFiles(req);

      const config = await arcaConfigService.create({
        ...req.body,
        pointOfSale: req.body.pointOfSale,
        certPem,
        keyPem,
      });

      res.status(201).json({ ok: true, content: config });
    } catch (error) {
      next(error);
    }
  },

  async uploadCertificate(req: Request, res: Response, next: NextFunction) {
    try {
      const certPem = pickOnlyCertificate(req);

      if (!certPem) {
        return res.status(400).json({
          ok: false,
          error: "Tenés que subir el certificado .crt que devuelve ARCA.",
        });
      }

      const config = await arcaConfigService.uploadCertificate({
        certPem,
        certExpiresAt: req.body.certExpiresAt,
      });

      res.json({ ok: true, content: config });
    } catch (error) {
      next(error);
    }
  },

  async uploadCertificates(req: Request, res: Response, next: NextFunction) {
    try {
      const { certPem, keyPem } = pickCertificateFiles(req);

      if (!certPem) {
        return res.status(400).json({
          ok: false,
          error: "Tenés que subir el certificado .crt.",
        });
      }

      const config = await arcaConfigService.uploadCertificates({
        certPem,
        keyPem,
        certExpiresAt: req.body.certExpiresAt,
      });

      res.json({ ok: true, content: config });
    } catch (error) {
      next(error);
    }
  },

  async deleteCertificates(_req: Request, res: Response, next: NextFunction) {
    try {
      const config = await arcaConfigService.deleteCertificates();
      res.json({ ok: true, content: config });
    } catch (error) {
      next(error);
    }
  },

  async activate(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id ? getParamAsString(req.params.id, "id") : undefined;
      const result = await arcaConfigService.activate(id);
      res.json({ ok: true, content: result });
    } catch (error) {
      next(error);
    }
  },

async test(req: Request, res: Response) {
  try {
    const id = req.params.id
      ? getParamAsString(req.params.id, "id")
      : undefined;

    console.log("🧪 Probando conexión ARCA...");
    console.log("🆔 Config ID:", id);

    if (!id) {
      return res.status(400).json({
        ok: false,
        error: "Falta el ID de configuración ARCA.",
      });
    }

    const activatedConfig = await arcaConfigService.activate(id);

    console.log("✅ Configuración activada antes del test:", {
      id,
      activatedConfig,
    });

    const token = await generarTokenAFIP();

    console.log("✅ Token ARCA generado correctamente:", {
      expiration: token.expiration,
    });

    return res.json({
      ok: true,
      message: "Conexión con ARCA correcta. Token generado.",
      expiration: token.expiration,
    });
  } catch (error: any) {
    console.error("❌ Error probando conexión ARCA");
    console.error("MESSAGE:", error?.message);
    console.error("CODE:", error?.code);
    console.error("STATUS:", error?.response?.status);
    console.error("DATA:", error?.response?.data);
    console.error("STACK:", error?.stack);

    return res.status(500).json({
      ok: false,
      error: error?.message || "Error probando conexión con ARCA.",
      detail: error?.response?.data || null,
      code: error?.code || null,
      status: error?.response?.status || null,
    });
  }
},  

  async testWsaa(_req: Request, res: Response) {
    try {
      const token = await generarTokenAFIP();
      res.json({
        ok: true,
        message: "WSAA correcto. Token/sign generados.",
        expiration: token.expiration,
      });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  },

  async testWsfeDummy(_req: Request, res: Response) {
    try {
      const token = await generarTokenAFIP();
      res.json({
        ok: true,
        message: "Configuración activa y WSAA correctos. Listo para probar WSFE.",
        expiration: token.expiration,
      });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      await arcaConfigService.remove(getParamAsString(req.params.id, "id"));
      res.json({ ok: true, message: "Configuración ARCA eliminada." });
    } catch (error) {
      next(error);
    }
  },

  async listPointsOfSale(_req: Request, res: Response, next: NextFunction) {
    try {
      const points = await arcaConfigService.listPointsOfSale();
      res.json({ ok: true, content: points });
    } catch (error) {
      next(error);
    }
  },

  async upsertPointOfSale(req: Request, res: Response, next: NextFunction) {
    try {
      const point = await arcaConfigService.upsertPointOfSale(req.body);
      res.json({ ok: true, content: point });
    } catch (error) {
      next(error);
    }
  },

  async deletePointOfSale(req: Request, res: Response, next: NextFunction) {
    try {
      const point = await arcaConfigService.deletePointOfSale(getParamAsString(req.params.id, "id"));
      res.json({ ok: true, content: point });
    } catch (error) {
      next(error);
    }
  },

  async listRemitoCais(_req: Request, res: Response, next: NextFunction) {
    try {
      const remitos = await arcaConfigService.listRemitoCais();
      res.json({ ok: true, content: remitos });
    } catch (error) {
      next(error);
    }
  },

  async upsertRemitoCai(req: Request, res: Response, next: NextFunction) {
    try {
      const remito = await arcaConfigService.upsertRemitoCai(req.body);
      res.json({ ok: true, content: remito });
    } catch (error) {
      next(error);
    }
  },

  async deleteRemitoCai(req: Request, res: Response, next: NextFunction) {
    try {
      const remito = await arcaConfigService.deleteRemitoCai(getParamAsString(req.params.id, "id"));
      res.json({ ok: true, content: remito });
    } catch (error) {
      next(error);
    }
  },

  async listAuditLogs(_req: Request, res: Response, next: NextFunction) {
    try {
      const logs = await arcaConfigService.listAuditLogs();
      res.json({ ok: true, content: logs });
    } catch (error) {
      next(error);
    }
  },
};
