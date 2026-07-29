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

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  startScheduler();
});
