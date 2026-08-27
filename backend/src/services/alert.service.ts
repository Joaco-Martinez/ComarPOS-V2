import prisma from "../prisma";
import nodemailer from "nodemailer";
import { Product, ProductStock, BusinessLocation, SaleUnit } from "@prisma/client";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";

type ProductWithStock = Product & { stock: (ProductStock & { businessLocation: BusinessLocation })[] };

const stockInclude = { stock: { include: { businessLocation: true } } } as const;

class AlertService {
  async createAlert(
    productId: string,
    productName: string,
    stock: number,
    minStock: number,
    unit = "unidades",
    location?: string
  ) {
    const locationText = location ? ` en ${location}` : "";

    const message = `El producto "${productName}" tiene bajo stock${locationText} (${stock} ${unit}, mínimo ${minStock}).`;

    const existing = await prisma.alert.findFirst({
      where: {
        productId,
        resolved: false,
        message,
      },
    });

    if (existing) return existing;

    const alert = await prisma.alert.create({
      data: { productId, message },
    });

    try {
      await this.sendEmailToAllUsers(productName, stock, minStock, unit, location);
    } catch (error) {
      console.error("Error enviando alerta por email:", error);
    }

    return alert;
  }

  async checkProductStock(productId: string) {
    const product = await prisma.product.findFirst({
      where: { id: productId, ...tenantScope() },
      include: stockInclude,
    });

    if (!product) return [];

    return this.checkProductStockFromData(product);
  }

  // Una alerta por cada (producto, ubicacion) que este por debajo de su
  // propio minimo - generalizado a N ubicaciones dinamicas (ver doc de
  // migracion "ubicaciones de stock dinamicas"), reemplaza el chequeo fijo
  // LOCAL/DEPOSITO.
  async checkProductStockFromData(product: ProductWithStock) {
    const alerts: {
      id: string;
      productId: string;
      message: string;
      createdAt: Date;
      resolved: boolean;
    }[] = [];

    if (product.isService) return alerts;
    if (product.unlimitedStock) return alerts;
    if (!product.isActive) return alerts;

    const isKg = product.saleUnit === SaleUnit.KG;
    const unit = isKg ? "kg" : "unidades";

    for (const row of product.stock) {
      if (!row.businessLocation.isActive) continue;

      const qty = Number((isKg ? row.quantityKg : row.quantity) ?? 0);
      const min = isKg ? row.minQuantityKg : row.minQuantity;

      if (min == null || Number(min) <= 0) continue;
      if (qty > Number(min)) continue;

      const alert = await this.createAlert(
        product.id,
        product.name,
        qty,
        Number(min),
        unit,
        row.businessLocation.name
      );

      alerts.push(alert);
    }

    return alerts;
  }

  async checkAllProductsStock() {
    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        isService: false,
        ...tenantScope(),
      },
      include: stockInclude,
    });

    const alerts = [];

    for (const product of products) {
      const productAlerts = await this.checkProductStockFromData(product);
      alerts.push(...productAlerts);
    }

    return alerts;
  }

  async getAlerts() {
    return prisma.alert.findMany({
      where: { product: { tenantId: currentTenantId() } },
      orderBy: { createdAt: "desc" },
      include: { product: true },
    });
  }

private async sendEmailToAllUsers(
  productName: string,
  stock: number,
  minStock: number,
  unit: string,
  location?: string
) {
  const users = await prisma.user.findMany({
    where: {
      role: {
        in: ["ADMIN", "EMPLEADO"],
      },
      isActive: true,
      ...tenantScope(),
    },
    select: {
      email: true,
    },
  });

  if (users.length === 0) return;
  if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) return;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,
    },
  });

  const emails = users
    .map((u) => u.email)
    .filter(Boolean)
    .join(",");

  if (!emails) return;

  const locationText = location ? ` en ${location}` : "";

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #111; color: #D4AF37;">
      <h2 style="color: #D4AF37; text-align: center;">⚠️ Alerta de Bajo Stock</h2>

      <div style="background: #1c1c1c; padding: 15px; border-radius: 8px; margin-top: 15px;">
        <p style="font-size: 16px; margin: 0; color: #fff;">
          El producto <strong style="color: #D4AF37;">"${productName}"</strong> tiene bajo stock${locationText}.
        </p>

        <p style="font-size: 18px; margin: 10px 0; text-align: center; color: #fff;">
          📦 <strong>${stock}</strong> ${unit} disponibles
          <span style="color: #aaa;">(mínimo ${minStock})</span>
        </p>

        ${
          location
            ? `
              <p style="font-size: 15px; margin: 10px 0 0; text-align: center; color: #D4AF37;">
                Ubicación: <strong>${location}</strong>
              </p>
            `
            : ""
        }
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"ERP" <${process.env.GMAIL_USER}>`,
    to: emails,
    subject: `⚠️ Alerta de bajo stock${locationText}`,
    html,
  });
}
}

export default new AlertService();
