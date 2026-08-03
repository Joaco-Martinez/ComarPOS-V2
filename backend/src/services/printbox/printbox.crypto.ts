import crypto from "crypto";

// Secreto propio para credenciales MQTT de printbox, separado de
// ARCA_CONFIG_SECRET a proposito (dominios distintos, ver backend/CLAUDE.md
// sobre por que AFIP tiene su propio secreto en vez de reusar uno global).
const ALGORITHM = "aes-256-gcm";

function getKey() {
  const secret = process.env.PRINTBOX_CREDENTIALS_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("PRINTBOX_CREDENTIALS_SECRET debe tener al menos 32 caracteres.");
  }

  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptPrintboxSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const key = getKey();

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptPrintboxSecret(value: string) {
  const [ivBase64, authTagBase64, encryptedBase64] = value.split(".");

  if (!ivBase64 || !authTagBase64 || !encryptedBase64) {
    throw new Error("Formato de credencial printbox inválido.");
  }

  const key = getKey();
  const iv = Buffer.from(ivBase64, "base64");
  const authTag = Buffer.from(authTagBase64, "base64");
  const encrypted = Buffer.from(encryptedBase64, "base64");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
