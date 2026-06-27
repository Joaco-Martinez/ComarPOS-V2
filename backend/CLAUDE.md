# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # nodemon + ts-node, runs src/index.ts with reload
npm run build             # tsc -> dist/
npm start                 # node dist/index.js (run build first)
npx prisma generate       # regenerate Prisma client after schema.prisma changes
npx prisma migrate dev --name <name>   # create + apply a migration (dev)
npx prisma migrate deploy              # apply pending migrations (prod)
npm run prisma:studio     # npx prisma studio
npm run seed              # ts-node src/seed.ts
npm run reset             # ts-node src/reset.ts
npm run worker            # ts-node src/worker.ts (background worker, e.g. AFIP retry queue)
npm run afip:renew        # ts-node src/cron/afipRenovador.ts (renew AFIP/WSAA token)
npm run expire:quotations # ts-node src/jobs/expirePendingQuotations.ts
```

There is no test suite, linter, or single-test command configured in this project (no `test`/`lint` script in package.json, no Jest/Vitest config). Type-check with `npx tsc --noEmit` when validating changes — this is the closest thing to a CI gate the auditor used historically (see `CAMBIOS_AUDITORIA.md`).

## Architecture

Express 5 + Prisma + PostgreSQL, single-process REST API (`src/app.ts` wires routes, `src/index.ts` boots it). Env vars are validated at startup (`DATABASE_URL`, `JWT_SECRET` ≥64 chars, `ARCA_CREDENTIALS_SECRET`, `ARCA_CONFIG_SECRET`) — the process refuses to start if missing. See `.env.example` for the full list.

**Auth**: JWT read from either the `token` cookie or `Authorization: Bearer`, set in `src/middleware/auth.ts`. `authMiddleware` requires a valid token, `requireRole`/`requireAnyRole` gate by `Role` enum (`ADMIN`, `EMPLEADO`, `CLIENTE`, `CONTADOR`), `optionalAuthMiddleware` allows anonymous access for public/storefront routes. Route-level auth is applied per-mount in `app.ts` (e.g. `/users` and `/product-stats` require auth at the router-mount level, not inside each route file) — check `app.ts` before assuming a route is protected.

**Errors**: normalize through `src/utils/asyncHandler.ts` — wrap async controllers in `asyncHandler()` to avoid try/catch boilerplate, and throw `AppError` subclasses (`StockInsuficienteError`, `ClienteNoEncontradoError`, `AfipRejectedError`, `AfipUnavailableError`) for expected business failures so they map to correct HTTP status/codes. This is being adopted gradually, not all controllers/services use it yet.

**Domain model** (`prisma/schema.prisma`): central entities are `Sale` → `SaleItem` → `Product`, with `Client`, `User` (roles), `BusinessLocation`, `Purchase`/`PurchaseItem`, `Finance`, `StockMovement`, `AccountMovement` (client running balance/credit), and `Remito` (delivery notes with AFIP CAI). `Tenant` + nullable `tenantId` exist on most models and are actively scoped per-request (see multi-tenant note below) — today there's a single real tenant (`grupo-vj`). Products track stock split by `Location` (`LOCAL`/`DEPOSITO`) and by unit (`UNIT` count vs `KG` float fields), and can be `SIMPLE` or `COMPUESTO` (composite, via `ProductComponent`, e.g. boxes/kits made of other products).

**AFIP/ARCA invoicing** lives in two places:
- `src/afip/` — the active WSAA (auth/token) and WSFE (invoice emission) integration: `wsaa.service.ts`, `wsfe-base/A/B/C.service.ts`, `cbteCounter.service.ts` (manages comprobante numbering via `CbteCounter`), `cron.service.ts`. Mounted at `/afip`.
- `src/services/arcaConfig.service.ts` + `src/controllers/arcaConfig.controller.ts` + `src/routes/arcaConfig.routes.ts` — configuration/credentials management (certs, points of sale, CAI for remitos), mounted at `/arca-config` (canonical) and aliased at `/afip/configuracion` (deprecated, kept for old clients — do not remove without checking frontend usage).
- `src/afip/_legacy-disabled/` is dead code, intentionally excluded from the active module graph — do not wire it back in.
- AFIP credentials/certs are encrypted at rest (`src/services/arcaCrypto.service.ts`, `certEncrypted`/`keyEncrypted`/`tokenEncrypted`/`signEncrypted` columns) using `ARCA_CREDENTIALS_SECRET`/`ARCA_CONFIG_SECRET`.
- AFIP calls are flaky/rate-limited by nature: `Sale.invoiceStatus`/`nextRetryAt`/`retryCount`/`afipLastError` implement a retry queue, processed by `src/cron/afipRetry.worker.ts` / `npm run worker`. Treat AFIP-adjacent changes as high-risk — prefer testing against the homologación (`ARCA_WSAA_HOMO_URL`/`ARCA_WSFE_HOMO_URL`) environment, never production AFIP, when iterating.

**Larger services are split into submodules** under a directory of the same base name to keep files manageable, e.g. `src/services/sale/` (`sale.pricing.ts`, `sale.stock.ts`, `sale.payment.ts`, `sale.query.ts`, `sale.types.ts`, re-exported from `index.ts`) and `src/services/product/`. The flat `sale.service.ts` / `product.service.ts` files still exist alongside and are large (sale.service.ts ~2400 lines) — full modularization is unfinished/in-progress (see `CAMBIOS_AUDITORIA.md`), so check both locations for relevant logic before assuming where something lives.

**PDF/print generation**: tickets, facturas, notas de crédito, remitos, and cotizaciones each have a dedicated generator (`src/utils/generarCotizacionPDF.ts`, `src/utils/generarReciboPDF.ts`, `src/services/facturaPdfGenerator.service.ts`, `src/services/remitoPdf.service.ts`, `src/services/cashClosePrint.service.ts`), using `pdfkit`. Local POS ticket printing goes through `pdf-to-printer` / a configured `POS_LOCAL_URL` printing bridge, not directly from this server's filesystem.

**Swagger**: route-level docs live as YAML files (see `src/docs/` referenced from `src/config/swagger.ts`), aggregated by `swagger-jsdoc`/`swagger-ui-express`. If you add or rename a route, check whether a matching spec file needs updating or the OpenAPI doc will silently miss it.

## Things to know before touching code

- **`prisma/migrations2/` and `prisma/migrationsss/` are legacy/orphaned migration folders, not used by the Prisma CLI** (which only reads `prisma/migrations/`). Don't add new migrations there, and don't assume they reflect current schema state — only `prisma/migrations/` is live.
- **Multi-tenant (doc seccion 6) is wired end-to-end at the data layer**: `tenantId` (nullable) lives on ~12 models. Tenant is resolved per-request by subdomain in `src/middleware/tenant.ts` (mounted globally in `app.ts`), which wraps the rest of the request in `runWithTenant()` (`src/context/tenantContext.ts`, an `AsyncLocalStorage`) — any service can read the current tenant via `currentTenantId()` or spread `tenantScope()` (`src/utils/tenantScope.ts`) into a Prisma `where`/`data` **without needing the controller to pass it down explicitly**. Falls back to `DEFAULT_TENANT_SLUG` for localhost/no-subdomain, with an `X-Tenant-Slug` override header in non-production. Migration `20260623120000_seed_default_tenant_grupo_vj` creates the `grupo-vj` tenant and backfills existing rows. JWTs embed `tenantId`; `authMiddleware` 401s if it mismatches the subdomain's tenant.
  - Background jobs (`src/cron/afipRetry.worker.ts`, `expirePendingQuotations` in `sale.lifecycle.ts`) run outside a request, so they explicitly `runWithTenant(row.tenantId, ...)` per row before touching it — if you add a new cron/worker that writes tenant-scoped data, do the same, or new rows will get `tenantId: null`.
  - **Known gaps, not fixed in this pass**: several DB-level `@unique` constraints are still global, not per-tenant (`Product.sku`, `Client.dni`/`gmail`, `User.email`, `CbteCounter` on `ptoVta`+`cbteTipo`) — a second real tenant could collide with the first on these. `ArcaConfig.scope` was also globally unique pre-multi-tenant; new tenants get `TENANT_<tenantId>` as their scope value (see `arcaConfig.core.ts`) to avoid colliding with the existing `GRUPO_VJ` row, but this is a workaround, not a real fix. `src/afip/wsaa.service.ts` (WSAA token logic) was deliberately left untouched (high-risk, see Section 7 below) — its cron (`afipRenovador.ts`) only renews one arbitrary tenant's token today.
  - **Not done**: the AFIP module split called for in Section 7 (idempotency keys, `FECompConsultar` pre-retry check, fiscal-parameter caching) — only tenant scoping was added to AFIP-adjacent queries, not the emission logic itself.
- Money fields are `Float`, not `Decimal` — a known precision gap flagged in `CAMBIOS_AUDITORIA.md` but not yet migrated; be careful introducing new arithmetic that could compound rounding issues.
- `GET /` is a healthcheck only — it used to leak `prisma.user.findMany()` (full user table incl. password hashes) and was fixed; don't reintroduce data fetching on that route.
- CORS allowlist and a path-blocklist (for `.env`, `.git`, etc. probing) are hardcoded in `src/app.ts` before any router mounts — update the `allowedOrigins`/`forbiddenPatterns` arrays there if adding new frontends or paths.
- `JWT_SECRET` must be ≥64 chars and there is no fallback default (a previous insecure `|| "supersecret"` fallback was removed) — both `src/index.ts` and `src/middleware/auth.ts` throw at import time if it's missing/short.
