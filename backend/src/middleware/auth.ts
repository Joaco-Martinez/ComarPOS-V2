import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 64) {
  throw new Error("JWT_SECRET debe estar definido y tener minimo 64 caracteres");
}

type JwtPayload = {
  userId: string;
  role: string;
  tenantId?: string | null;
};

// doc seccion 6 - multi-tenant: si el token trae tenantId y no coincide con
// el tenant resuelto por subdominio (req.tenantId, ver middleware/tenant.ts),
// el token es de otro tenant y no es valido aca. Los tokens sin tenantId
// (usuarios legacy con tenantId null) no se bloquean.
function tenantMismatch(req: Request, decoded: JwtPayload) {
  const requestTenantId = (req as any).tenantId;
  return Boolean(decoded.tenantId && requestTenantId && decoded.tenantId !== requestTenantId);
}

function readToken(req: Request) {
  const cookieToken = req.cookies?.token;
  const authorization = req.headers.authorization;

  if (cookieToken) return cookieToken;

  if (authorization?.startsWith("Bearer ")) {
    return authorization.replace("Bearer ", "").trim();
  }

  return null;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = readToken(req);

  if (!token) {
    return res.status(401).json({ message: "Token requerido" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET as string) as unknown as JwtPayload;

    if (tenantMismatch(req, decoded)) {
      return res.status(401).json({ message: "Token inválido" });
    }

    (req as any).user = { id: decoded.userId, role: decoded.role, tenantId: decoded.tenantId };
    next();
  } catch (_err) {
    return res.status(401).json({ message: "Token inválido" });
  }
}

export function optionalAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  const token = readToken(req);

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET as string) as unknown as JwtPayload;

    if (tenantMismatch(req, decoded)) {
      (req as any).user = undefined;
      return next();
    }

    (req as any).user = { id: decoded.userId, role: decoded.role, tenantId: decoded.tenantId };
  } catch (_err) {
    // En rutas públicas no bloqueamos por token vencido/incorrecto.
    // Simplemente se responde como visitante y el frontend puede pedir login al checkout.
    (req as any).user = undefined;
  }

  next();
}

export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;

    if (!user || user.role !== role) {
      return res.status(403).json({ message: "No autorizado" });
    }

    next();
  };
}

export function requireAnyRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;

    if (!user || !roles.includes(user.role)) {
      return res.status(403).json({ message: "No autorizado" });
    }

    next();
  };
}
