import rateLimit from "express-rate-limit";

// Fuerza bruta sobre login: tope generoso para no bloquear un negocio real
// con varios cajeros detras del mismo NAT/IP, pero suficiente para frenar
// un intento automatizado de prueba de contraseñas.
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    code: "TOO_MANY_ATTEMPTS",
    message: "Demasiados intentos de inicio de sesión. Probá de nuevo en unos minutos.",
  },
});
