import swaggerJSDoc from "swagger-jsdoc";
import { serve, setup } from "swagger-ui-express";
import { Express } from "express";


const options: swaggerJSDoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Grupo VJ API",
      version: "1.0.0",
      description:
        "Documentación de la API para el sistema Von König.\n\n" +
        "**Multi-tenant (doc seccion 6):** el tenant se resuelve por subdominio " +
        "(ej. `grupo-vj.tudominio.com` -> tenant `grupo-vj`). Si no hay subdominio " +
        "(localhost, IP, dominio sin subdominio) se usa el tenant default " +
        "(`DEFAULT_TENANT_SLUG`, hoy `grupo-vj`). En entornos no productivos se " +
        "puede forzar el tenant con el header `X-Tenant-Slug` (ver parametro " +
        "`XTenantSlug` en los endpoints), util para probar varios tenants sin " +
        "DNS real. El JWT de sesion incluye el `tenantId` del usuario y se " +
        "rechaza si no coincide con el tenant resuelto por subdominio.",
    },
    servers: [
        {
    url: "/",
    description: "Mismo host donde corre Swagger",
  },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Token JWT (tambien se acepta via cookie httpOnly 'token')",
        },
      },
      parameters: {
        XTenantSlug: {
          name: "X-Tenant-Slug",
          in: "header",
          required: false,
          schema: { type: "string" },
          description:
            "Solo en entornos no productivos: fuerza el tenant en vez de resolverlo " +
            "por subdominio. Util para probar multi-tenant en localhost.",
        },
      },
    },
  },
  apis: ["./src/docs/*.yaml"],
};


const swaggerSpec = swaggerJSDoc(options);

export function swaggerDocs(app: Express) {
  app.use("/api", serve, setup(swaggerSpec));
  console.log("📖 Swagger docs disponible en http://localhost:4000/api");
}