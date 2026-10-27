import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  (req as any).requestId = req.headers["x-request-id"] || randomUUID();
  res.setHeader("X-Request-Id", (req as any).requestId);

  res.on("finish", () => {
    const now = new Date().toISOString();
    const duration = Date.now() - start;
    console.log(
      `[${now}] ${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms) [${(req as any).requestId}]`
    );
  });

  next();
}

export function errorLogger(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const now = new Date().toISOString();
  const statusCode = err.status || err.statusCode || 500;
  const requestId = (req as any).requestId || randomUUID();

  console.error(`[${now}] ❌ Error en ${req.method} ${req.originalUrl} [${requestId}]`);
  console.error(`Código: ${statusCode}`);
  if (statusCode >= 500) {
    // En 5xx logueamos el detalle completo para diagnostico interno.
    console.error("Detalles:", err);
  }

  // Los errores de Prisma traen nombres de tablas/columnas y fragmentos de la
  // query: en produccion no se le devuelven al cliente (quedan en el log de
  // arriba). Los errores de negocio (new Error("...")) se siguen mostrando
  // tal cual porque el frontend los usa como mensaje para el usuario.
  const isInternalDbError =
    process.env.NODE_ENV === "production" && typeof err?.name === "string" && err.name.startsWith("PrismaClient");

  res.status(statusCode).json({
    ok: false,
    code: isInternalDbError
      ? "INTERNAL_ERROR"
      : err.code || (statusCode >= 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR"),
    message: isInternalDbError ? "Error interno del servidor" : err.message || "Error interno del servidor",
    details: err.details ?? undefined,
    requestId,
  });
}
