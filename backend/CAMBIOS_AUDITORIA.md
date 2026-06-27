# Cambios aplicados sobre la auditoria (ComarPOS_Auditoria_Backend_Cambios.docx)

Fecha: 2026-06-20

## ✅ Aplicado (seguro, probado con `tsc --noEmit`, no rompe contratos existentes)

### Seccion 3 — Seguridad y estabilidad (P0)
- `GET /` ya no expone `prisma.user.findMany()` (filtraba todos los usuarios, hashes de password incluidos, sin auth). Ahora es un healthcheck.
- `/afip/*` (facturar, nota-credito, pending-afip, factura-by-sale, token, prueba) no tenian `authMiddleware`. Ahora requieren login + rol `ADMIN`/`CONTADOR`.
- Eliminado el fallback inseguro `JWT_SECRET || "supersecret"`. Si falta o es corto, el server no arranca.
- `src/index.ts` valida `DATABASE_URL`, `JWT_SECRET`, `ARCA_CREDENTIALS_SECRET`, `ARCA_CONFIG_SECRET` al bootear.
- Log duplicado de cada request eliminado (quedaba doble con morgan/requestLogger).
- `.gitignore` ahora excluye `certs/`, `*.key`, `*.crt`, `tmp/`, `uploads/`, `.env.*`.
- Ruta duplicada `/afip/configuracion` marcada como alias deprecado (se mantiene por compatibilidad, `/arca-config` es la canonica).

### Seccion 5 — Performance
- `GET /sales`: el controller ignoraba `req.query` y siempre llamaba `saleService.getAll()` sin parametros, por lo que la paginacion que ya existia en el service **nunca se activaba** y devolvia todo. Corregido: ahora lee `page`, `limit` (default 50, tope 100), `status` y `search` desde la query string.

### Seccion 6 — Base de datos
- Agregados los indices compuestos que pide el doc: `Sale(status, createdAt)`, `Sale(clientId, createdAt)`, `Sale(invoiceStatus, nextRetryAt)`, `Product(isActive, name)`.
- Migracion SQL creada en `prisma/migrations/20260620130000_add_performance_indexes/migration.sql` (usa `CREATE INDEX IF NOT EXISTS`, no destructiva). **No se aplico contra la base de Railway** porque no hay acceso de red desde este entorno a la DB de produccion — correr `npx prisma migrate deploy` desde tu entorno.

### Seccion 8 — Swagger
- `catalog.yaml` no tenia raiz `paths:` (rompia la integracion al spec). Corregido y validado: ahora `swagger-jsdoc` carga 92 paths sin error (antes faltaban 9 grupos completos de endpoints reales no documentados).
- Agregados specs nuevos: `account.yaml`, `remito.yaml`, `purchase.yaml`, `businessLocation.yaml`, `delivery.yaml`, `printing.yaml` (tickets, cash-close, factura-pdf), `arcaConfig.yaml`.
- Agregado `components.securitySchemes.bearerAuth` global para que Swagger UI permita probar endpoints autenticados.
- Estos specs son nivel "contrato basico" (paths, metodos, security, responses minimas) — todavia falta documentar request bodies detallados; ver pendientes.

### Seccion 9 — Validacion y errores
- Errores normalizados al formato del doc: `{ ok, code, message, details, requestId }`. `requestId` se genera por request (`X-Request-Id` en header y en body) y se propaga al log.
- Nuevo `src/utils/asyncHandler.ts`: `asyncHandler()` para no repetir try/catch, y clases `AppError`, `StockInsuficienteError`, `ClienteNoEncontradoError`, `AfipRejectedError`, `AfipUnavailableError` listas para usar en controllers/services.
  - **No se aplicaron todavia** dentro de cada controller/service (son ~30 archivos) porque cambiar el tipo de errores lanzados sin tests de regresion es el tipo de cambio que puede alterar codigos de estado HTTP que el frontend ya interpreta. Quedan listas para adoptarlas gradualmente.

## ⚠️ No aplicado todavia (alto riesgo sobre dinero/facturacion real, requiere staging)

Estos puntos del doc tocan directamente facturacion AFIP y montos de Grupo VJ en produccion. Implementarlos "a ciegas" es exactamente el tipo de cambio que la propia auditoria advierte evitar (seccion 1: "Riesgo fiscal"). Necesitan probarse contra el ambiente de homologacion ARCA antes de ir a produccion:

1. **Seccion 4 — Modularizacion completa de `sale.service.ts` (2380 lineas) y `product.service.ts` (1110 lineas)** en los ~9 submodulos que detalla el doc. Es factible pero son cientos de imports/exports a reacomodar; el riesgo no es tecnico sino de introducir un bug sutil en el calculo de stock o precios sin tests automatizados que lo agarren.
2. **Seccion 6 — Migracion Float → Decimal(12,2)** en montos (Sale, SaleItem, InvoiceAfip, Finance, etc). Esto cambia el tipo de dato en Postgres; necesita migracion de datos existentes y revalidacion de cada calculo (el propio doc lo marca como cambio sensible a diferencias de centavos).
3. **Seccion 6 — Multi-tenant** (`Tenant` + `tenantId` en ~12 tablas). Es un cambio de modelo de datos transversal; sin decidir la estrategia de tenant (subdominio, header, etc.) y sin poder migrar datos existentes de Grupo VJ a un tenant default de forma segura, no lo apliqué.
4. **Seccion 7 — Refactor de AFIP en modulos** (`wsfe-invoice.service.ts`, `wsfe-numbering.service.ts`, idempotencyKey, FECompConsultar antes de reintentar, cache de parametros fiscales). Es la parte mas sensible del sistema: toca emision real de comprobantes. Recomiendo hacerlo en una rama aparte contra homologacion ARCA, no en una pasada automatica.
5. **Seccion 10/11 — CashSession formal, reportes separados de finance.service, tests Jest/Supertest, k6**. Quedan como roadmap; no se crearon tests porque sin entorno de base de datos de test no se pueden correr de forma confiable.

## Como seguir
Si queres, el proximo paso mas seguro es: (a) correr la migracion de indices en homologacion, (b) elegir UN submodulo chico para modularizar primero (ej. `sale-pricing.service.ts`, que el doc dice que debe poder testearse sin Prisma) y armar tests antes de tocar el resto.
