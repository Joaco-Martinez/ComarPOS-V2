import "./config/timezone";
import dotenv from "dotenv";
dotenv.config();

import { initSentry } from "./config/sentry";
initSentry();

const required = ["DATABASE_URL", "JWT_SECRET", "ARCA_CREDENTIALS_SECRET", "ARCA_CONFIG_SECRET"];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Falta variable requerida: ${key}`);
  }
}
if ((process.env.JWT_SECRET || "").length < 64) {
  throw new Error("JWT_SECRET debe tener minimo 64 caracteres");
}

import app from "./app";
import { startScheduler } from "./cron/scheduler";
import { startPrintboxAckListener } from "./services/printbox";

// La mayoria de los controllers todavia no usa asyncHandler (ver
// CAMBIOS_AUDITORIA.md) y depende de try/catch manual: una promesa
// rechazada sin capturar en cualquiera de ellos no debe tirar abajo el
// proceso entero sin dejar rastro. Loguea y sigue corriendo en vez de
// dejar que Node mate el proceso.
process.on("unhandledRejection", (reason) => {
  console.error("🚨 Unhandled promise rejection:", reason);
});

// Un uncaughtException deja al proceso en estado indefinido segun Node, asi
// que no lo ignoramos - solo logueamos con el maximo detalle posible antes
// de dejar que el proceso termine (mejor un restart limpio del proceso
// manager que seguir corriendo corrupto).
process.on("uncaughtException", (err) => {
  console.error("🚨 Uncaught exception:", err);
  process.exit(1);
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  startScheduler();
  startPrintboxAckListener();
});
