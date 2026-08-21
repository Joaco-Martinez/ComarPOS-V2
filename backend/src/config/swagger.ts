import swaggerJSDoc from "swagger-jsdoc";
import { serve, setup } from "swagger-ui-express";
import { Express } from "express";


const options: swaggerJSDoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "ComarPOS API",
      version: "1.0.0",
      description:
        "Documentación de la API para el sistema ComarPOS.\n\n" +
        "**Multi-tenant (doc seccion 6):** no hay resolucion por subdominio/DNS. " +
        "El JWT de sesion incluye el `tenantId` del usuario (se resuelve en el " +
        "login por email, que es unico globalmente) y ese es el tenant que manda " +
        "en toda ruta autenticada. Para requests sin autenticar se usa el tenant " +
        "default (`DEFAULT_TENANT_SLUG`, hoy `grupo-vj`); en entornos no " +
        "productivos se puede forzar otro tenant con el header `X-Tenant-Slug` " +
        "(ver parametro `XTenantSlug` en los endpoints), util para probar varios " +
        "tenants en localhost.",
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
            "Solo en entornos no productivos: fuerza el tenant base para rutas sin " +
            "autenticar (no hay subdominio/DNS involucrado). Util para probar " +
            "multi-tenant en localhost.",
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