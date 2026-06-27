import { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Envuelve un controller async para no repetir try/catch en cada uno.
 * Uso: router.get("/", asyncHandler(controller.getAll))
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Error de negocio con codigo y status HTTP explicitos, para diferenciarlo
 * de errores internos no esperados (doc seccion 9).
 */
export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class StockInsuficienteError extends AppError {
  constructor(message: string, details?: unknown) {
    super("STOCK_INSUFICIENTE", message, 409, details);
  }
}

export class ClienteNoEncontradoError extends AppError {
  constructor(message = "Cliente no encontrado", details?: unknown) {
    super("CLIENTE_NO_ENCONTRADO", message, 404, details);
  }
}

export class AfipRejectedError extends AppError {
  constructor(message: string, details?: unknown) {
    super("AFIP_REJECTED", message, 422, details);
  }
}

export class AfipUnavailableError extends AppError {
  constructor(message = "AFIP no disponible, reintentar mas tarde", details?: unknown) {
    super("AFIP_UNAVAILABLE", message, 503, details);
  }
}
