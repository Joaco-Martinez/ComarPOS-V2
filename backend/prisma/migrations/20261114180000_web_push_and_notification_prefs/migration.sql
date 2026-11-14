-- Nuevos tipos de notificacion (pedidos de la tienda online)
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ORDER_NEW';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ORDER_PAID';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ORDER_TRANSFER_PROOF';

-- Preferencias de notificaciones por usuario
ALTER TABLE "User" ADD COLUMN "notificationPrefs" JSONB;

-- Suscripciones Web Push (PWA)
CREATE TABLE "WebPushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebPushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebPushSubscription_endpoint_key" ON "WebPushSubscription"("endpoint");
CREATE INDEX "WebPushSubscription_userId_idx" ON "WebPushSubscription"("userId");
CREATE INDEX "WebPushSubscription_tenantId_idx" ON "WebPushSubscription"("tenantId");

ALTER TABLE "WebPushSubscription" ADD CONSTRAINT "WebPushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebPushSubscription" ADD CONSTRAINT "WebPushSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
