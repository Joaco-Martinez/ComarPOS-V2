import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import prisma from "./prisma";
import facturaPdfRoutes from "./routes/factura-pdf.routes";
import { requestLogger, errorLogger } from "./middleware/logger";
import { Sentry, sentryEnabled } from "./config/sentry";
import { swaggerDocs } from "./config/swagger";
import { authMiddleware, requireRole } from "./middleware/auth";
import { tenantMiddleware } from "./middleware/tenant";
import { verifyCsrfToken, ensureCsrfCookie } from "./middleware/csrf";
import { requirePlanFeature } from "./middleware/planFeature";
import afipRoutes from "./afip/afip.routes";
import notaCreditoPdfRoutes from "./routes/notaCreditoPdf.routes";
import notaCreditoRoutes from "./routes/notaCredito.routes";
import alertRoutes from "./routes/alert.routes";
import purchaseRoutes from "./routes/purchase.routes";
import libroIvaDigitalRoutes from "./routes/libroIvaDigital.routes";
import cashClosePrintRouter from "./routes/cashClosePrint.routes";
import userRoutes from "./routes/user.routes";
import authRoutes from "./routes/auth.routes";
import productRoutes from "./routes/product.routes";
import remitoRoutes from "./routes/remito.routes";
import accountRoutes from "./routes/account.routes";
import supplierAccountRoutes from "./routes/supplierAccount.routes";
import businessLocationRoutes from "./routes/businessLocation.routes";
import saleRoutes from "./routes/sale.routes";
import categoryRoutes from "./routes/category.routes";
import priceListRoutes from "./routes/priceList.routes";
import clientRouter from "./routes/client.routes";
import financeRoutes from "./routes/finance.routes";
import financeAccountRoutes from "./routes/financeAccount.routes";
import productStatsRoutes from "./routes/productStats.routes";
import catalogRoutes from "./routes/catalog.routes";
import storefrontRoutes from "./routes/storefront.routes";
import storefrontAdminRoutes from "./routes/storefrontAdmin.routes";
import { storefrontTenantMiddleware } from "./middleware/storefrontTenant";
import { mpWebhookController } from "./controllers/mpWebhook.controller";
import arcaConfigRoutes from "./routes/arcaConfig.routes";
import ticketRoutes from "./routes/ticket.routes";
import analyticsRoutes from "./routes/analytics.routes";
import supplierRoutes from "./routes/supplier.routes";
import cashSessionRoutes from "./routes/cashSession.routes";
import recurringExpenseRoutes from "./routes/recurringExpense.routes";
import exchangeRateRoutes from "./routes/exchangeRate.routes";
import salesGoalRoutes from "./routes/salesGoal.routes";
import promotionRoutes from "./routes/promotion.routes";
import stockCountRoutes from "./routes/stockCount.routes";
import purchaseOrderRoutes from "./routes/purchaseOrder.routes";
import auditLogRoutes from "./routes/auditLog.routes";
import notificationRoutes from "./routes/notification.routes";
import loyaltyRoutes from "./routes/loyalty.routes";
import returnRoutes from "./routes/return.routes";
import exportRoutes from "./routes/export.routes";
import tenantLogoRoutes from "./routes/tenantLogo.routes";
import tenantRoutes from "./routes/tenant.routes";
import printboxRoutes from "./routes/printbox.routes";
import platformAdminRoutes from "./routes/platformAdmin.routes";
import trialSignupRoutes from "./routes/trialSignup.routes";
import businessPresetRoutes from "./routes/businessPreset.routes";
import billingRoutes from "./routes/billing.routes";
import onboardingRoutes from "./routes/onboarding.routes";
import repairOrderRoutes from "./routes/repairOrder.routes";
import roomTypeRoutes from "./routes/roomType.routes";
import roomRoutes from "./routes/room.routes";
import reservationRoutes from "./routes/reservation.routes";
dotenv.config();

const app = express();


app.use((req, res, next) => {
  const url = req.url.toLowerCase();

  const forbiddenPatterns = [
    "/.env",
    "/.git",
    "/.aws",
    "/storage",
    "/logs",
    "/debug.log",
    "/error.log",
    "/phpinfo",
    "/info.php",
    "/database.yml",
    "/settings.py",
  ];

  const isForbidden = forbiddenPatterns.some((item) => {
    return url === item || url.startsWith(`${item}/`);
  });

  if (isForbidden) {
    console.warn(`🚨 Bloqueado intento de acceso indebido a: ${req.url}`);
    return res.status(404).send("Not found");
  }

  next();
});

// 🔹 Middlewares globales
app.use(cookieParser());
// Resuelve req.tenant/req.tenantId con el tenant default (doc seccion 6 -
// multi-tenant, ver middleware/tenant.ts) - solo es la base para requests sin
// autenticar, authMiddleware lo pisa despues con el tenantId del JWT. No
// bloquea requests: el scoping de queries por tenantId es incremental,
// modulo por modulo, y todavia no esta aplicado en los services.
app.use(tenantMiddleware);
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    const envOrigins = [
      process.env.FRONTEND_URL,
      process.env.STOREFRONT_URL,
      process.env.ADMIN_FRONTEND_URL,
      process.env.CORS_ORIGINS,
    ]
      .filter(Boolean)
      .flatMap((value) => String(value).split(","))
      .map((value) => value.trim())
      .filter(Boolean);

    const allowedOrigins = [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3002",
      "http://localhost:3010",
      "http://localhost:4000",
      "https://von-konig.vercel.app",
      "https://www.vonkonigerp.com.ar",
      ...envOrigins,
    ];

    // Permitir requests sin Origin (Postman, mobile apps, bots internos)
    if (!origin) {
      return callback(null, true);
    }

    // Validar correctamente
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn("🚫 CORS bloqueado:", origin);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));
app.use(express.json());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(requestLogger);
// Double-submit cookie CSRF (ver middleware/csrf.ts): primero repara sesiones
// viejas sin csrf_token, despues bloquea mutaciones que ya viajan con una
// cookie de sesion propia (token/platform_token) y no traen el header
// X-CSRF-Token esperado.
app.use(ensureCsrfCookie);
app.use(verifyCsrfToken);

// 🔹 Healthcheck (no expone datos sensibles)
app.get("/", async (_req, res, next) => {
  try {
    res.json({ ok: true, service: "ComarPOS backend" });
  } catch (err) {
    next(err);
  }
});

// 🔹 Rutas
app.use("/factura-pdf", facturaPdfRoutes);
app.use("/auth", authRoutes);
app.use("/products", productRoutes);
app.use("/catalog", catalogRoutes);
// Webhook de Mercado Pago (publico, sin auth) - montado ANTES que
// "/tienda/:tenantSlug" a proposito: si no, storefrontTenantMiddleware
// intentaria resolver "webhooks" como si fuera un slug de tenant y
// devolveria 404 antes de llegar acá. El tenant viene del :tenantId en la
// URL (ver order.service.ts#handleMpWebhook), no de un slug ni del JWT.
app.post("/tienda/webhooks/mercadopago/:tenantId", mpWebhookController.handle);
// Tienda online publica por tenant (doc "tienda online por tenant") -
// storefrontTenantMiddleware resuelve el tenant real desde :tenantSlug (no
// el default de tenantMiddleware) y corre su propio chequeo de suspension.
app.use("/tienda/:tenantSlug", storefrontTenantMiddleware, storefrontRoutes);
// Panel de administracion de la tienda (autenticado, tenant del JWT como siempre).
app.use("/tienda-online", storefrontAdminRoutes);
app.use("/users", authMiddleware, requireRole("ADMIN"), requirePlanFeature("usuarios"), userRoutes);
app.use("/sales", saleRoutes);
app.use("/accounts", accountRoutes);
// Cuenta corriente de proveedores -- ver routes/supplierAccount.routes.ts.
// Mismo prefijo /accounts que los clientes (/accounts/clients/:clientId),
// para que ambas cuentas corrientes vivan bajo el mismo namespace de API.
app.use("/accounts/suppliers", supplierAccountRoutes);
app.use("/categories", categoryRoutes);
app.use("/price-lists", priceListRoutes);
app.use("/purchases", purchaseRoutes);
app.use("/libro-iva-digital", libroIvaDigitalRoutes);
app.use("/nota-credito-pdf", notaCreditoPdfRoutes);
app.use("/nota-credito", notaCreditoRoutes);
app.use("/finance", financeRoutes);
app.use("/finance-accounts", financeAccountRoutes);
app.use("/clients", clientRouter);
app.use("/cash-close", cashClosePrintRouter);
app.use("/business-locations", businessLocationRoutes);
app.use("/tickets", ticketRoutes);
app.use("/remitos", remitoRoutes);
app.use("/arca-config", arcaConfigRoutes);
// ⚠️ Alias deprecado: mantiene compatibilidad con clientes viejos. Usar /arca-config.
app.use("/afip/configuracion", arcaConfigRoutes);
app.use("/alerts", alertRoutes);
app.use("/onboarding", onboardingRoutes);
app.use("/product-stats", authMiddleware, productStatsRoutes);
app.use("/afip", afipRoutes);
app.use("/analytics", analyticsRoutes);
app.use("/suppliers", supplierRoutes);
app.use("/cash-sessions", cashSessionRoutes);
app.use("/recurring-expenses", recurringExpenseRoutes);
app.use("/exchange-rates", exchangeRateRoutes);
app.use("/sales-goals", salesGoalRoutes);
app.use("/promotions", promotionRoutes);
app.use("/stock-counts", stockCountRoutes);
app.use("/purchase-orders", purchaseOrderRoutes);
app.use("/audit-logs", auditLogRoutes);
app.use("/notifications", notificationRoutes);
app.use("/loyalty", loyaltyRoutes);
app.use("/returns", returnRoutes);
app.use("/exports", exportRoutes);
app.use("/uploads", tenantLogoRoutes);
app.use("/tenant", tenantRoutes);
app.use("/printbox", printboxRoutes);
app.use("/platform-admin", platformAdminRoutes);
app.use("/trial-signup", trialSignupRoutes);
app.use("/business-presets", businessPresetRoutes);
app.use("/billing", billingRoutes);
app.use("/repair-orders", repairOrderRoutes);
app.use("/room-types", roomTypeRoutes);
app.use("/rooms", roomRoutes);
app.use("/reservations", reservationRoutes);

// 🔹 Swagger
swaggerDocs(app);

// 🔹 Sentry (opt-in, ver src/config/sentry.ts): reporta el error a Sentry y
// lo deja pasar a errorLogger para no cambiar el comportamiento existente.
if (sentryEnabled) {
  Sentry.setupExpressErrorHandler(app);
}

// 🔹 Logger de errores
app.use(errorLogger);

export default app;
