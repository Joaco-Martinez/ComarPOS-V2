import prisma from "../prisma";
import nodemailer from "nodemailer";
import { Product, SaleUnit } from "@prisma/client";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";

type StockLocationLabel = "LOCAL" | "DEPÓSITO";

class AlertService {
  async createAlert(
    productId: string,
    productName: string,
    stock: number,
    minStock: number,
    unit = "unidades",
    location?: StockLocationLabel
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
    });

    if (!product) return [];

    return this.checkProductStockFromData(product);
  }

  async checkProductStockFromData(product: Product) {
    const alerts: {
      id: string;
      productId: string;
      message: string;
      createdAt: Date;
      resolved: boolean;
    }[] = [];

    if (product.isService) return alerts;
    if (!product.isActive) return alerts;

    if (product.saleUnit === SaleUnit.KG) {
      // minStockKg queda como mínimo del LOCAL para no romper compatibilidad.
      const minStockLocalKg = Number(product.minStockKg ?? 0);
      const minStockDepositoKg = Number(product.minStockDepositoKg ?? 0);

      const stockLocalKg = Number(product.stockLocalKg ?? 0);
      const stockDepositoKg = Number(product.stockDepositoKg ?? 0);

      if (minStockLocalKg > 0 && stockLocalKg <= minStockLocalKg) {
        const alert = await this.createAlert(
          product.id,
          product.name,
          stockLocalKg,
          minStockLocalKg,
          "kg",
          "LOCAL"
        );

        alerts.push(alert);
      }

      if (minStockDepositoKg > 0 && stockDepositoKg <= minStockDepositoKg) {
        const alert = await this.createAlert(
          product.id,
          product.name,
          stockDepositoKg,
          minStockDepositoKg,
          "kg",
          "DEPÓSITO"
        );

        alerts.push(alert);
      }

      return alerts;
    }

    // minStock queda como mínimo del LOCAL para no romper compatibilidad.
    const minStockLocal = Number(product.minStock ?? 0);
    const minStockDeposito = Number(product.minStockDeposito ?? 0);

    const stockLocal = Number(product.stockLocal ?? 0);
    const stockDeposito = Number(product.stockDeposito ?? 0);

    if (minStockLocal > 0 && stockLocal <= minStockLocal) {
      const alert = await this.createAlert(
        product.id,
        product.name,
        stockLocal,
        minStockLocal,
        "unidades",
        "LOCAL"
      );

      alerts.push(alert);
    }

    if (minStockDeposito > 0 && stockDeposito <= minStockDeposito) {
      const alert = await this.createAlert(
        product.id,
        product.name,
        stockDeposito,
        minStockDeposito,
        "unidades",
        "DEPÓSITO"
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
  location?: StockLocationLabel
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
