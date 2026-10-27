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

// Alta de tenant self-service (prueba gratis): endpoint publico sin auth que
// crea un Tenant + User ADMIN por request, tope mas estricto que el login
// para no dejar automatizar la creacion masiva de negocios de prueba.
export const trialSignupRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    code: "TOO_MANY_ATTEMPTS",
    message: "Demasiados intentos. Probá de nuevo en un rato o escribinos por WhatsApp.",
  },
});

// Formularios publicos de la tienda (alta de cliente, olvide mi contraseña,
// reseteo): sin tope se podian usar para mandar mails en masa a cualquier
// direccion o probar tokens de reseteo de a miles.
export const publicFormRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    code: "TOO_MANY_ATTEMPTS",
    message: "Demasiados intentos. Probá de nuevo en unos minutos.",
  },
});

// Emparejamiento de PrintBox/desktop-agent: el pairingCode es de 6 digitos
// y vive 15 minutos, sin tope se podia adivinar por fuerza bruta y quedarse
// con los tickets de impresion de un negocio. Un emparejamiento real es un
// unico POST tecleado a mano.
export const printboxPairRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    code: "TOO_MANY_ATTEMPTS",
    message: "Demasiados intentos de emparejamiento. Probá de nuevo en unos minutos.",
  },
});
