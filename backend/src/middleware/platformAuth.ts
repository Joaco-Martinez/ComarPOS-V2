import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 64) {
  throw new Error("JWT_SECRET debe estar definido y tener minimo 64 caracteres");
}

type PlatformJwtPayload = {
  platformAdminId: string;
  type: string;
};

function readToken(req: Request) {
  const cookieToken = req.cookies?.platform_token;
  const authorization = req.headers.authorization;

  if (cookieToken) return cookieToken;

  if (authorization?.startsWith("Bearer ")) {
    return authorization.replace("Bearer ", "").trim();
  }

  return null;
}

// Middleware paralelo al authMiddleware de negocio (src/middleware/auth.ts):
// valida la cookie platform_token, exige type === "platform". No reusa
// authMiddleware para no acoplar el auth de plataforma al tenantMismatch
// de negocio (un platform admin no tiene tenantId).
export function platformAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = readToken(req);

  if (!token) {
    return res.status(401).json({ message: "Token requerido" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET as string) as unknown as PlatformJwtPayload;

    if (decoded.type !== "platform" || !decoded.platformAdminId) {
      return res.status(401).json({ message: "Token inválido" });
    }

    (req as any).platformAdmin = { id: decoded.platformAdminId };
    next();
  } catch (_err) {
    return res.status(401).json({ message: "Token inválido" });
  }
}
