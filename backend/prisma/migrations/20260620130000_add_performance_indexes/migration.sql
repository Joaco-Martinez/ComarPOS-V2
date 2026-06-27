-- Indices recomendados en auditoria (doc seccion 5) para acelerar listados de ventas y productos
CREATE INDEX IF NOT EXISTS "Sale_status_createdAt_idx" ON "Sale"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "Sale_clientId_createdAt_idx" ON "Sale"("clientId", "createdAt");
CREATE INDEX IF NOT EXISTS "Sale_invoiceStatus_nextRetryAt_idx" ON "Sale"("invoiceStatus", "nextRetryAt");
CREATE INDEX IF NOT EXISTS "Product_isActive_name_idx" ON "Product"("isActive", "name");
