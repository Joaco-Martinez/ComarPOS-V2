import ExcelJS from "exceljs";
import prisma from "../prisma";
import { SaleStatus } from "@prisma/client";
import { tenantScope } from "../utils/tenantScope";

function headerStyle(sheet: ExcelJS.Worksheet) {
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E3A5F" },
  };
  sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
}

function toARS(n: number | null | undefined) {
  return n != null ? Number(n.toFixed(2)) : 0;
}

function formatDate(d: Date | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
}

export const exportService = {
  async exportSales(params?: {
    fromDate?: Date;
    toDate?: Date;
    status?: SaleStatus;
  }) {
    const where: any = { ...tenantScope() };
    if (params?.status) where.status = params.status;
    if (params?.fromDate || params?.toDate) {
      where.createdAt = {};
      if (params?.fromDate) where.createdAt.gte = params.fromDate;
      if (params?.toDate) where.createdAt.lte = params.toDate;
    }

    const sales = await prisma.sale.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { nombre: true, apellido: true, dni: true } },
        user: { select: { name: true } },
        items: {
          include: { product: { select: { name: true, sku: true } } },
        },
        payments: true,
      },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = "ComarPOS";

    // Sheet 1 — sales summary
    const ws = wb.addWorksheet("Ventas");
    ws.columns = [
      { header: "Fecha", key: "date", width: 22 },
      { header: "ID", key: "id", width: 36 },
      { header: "Cliente", key: "client", width: 28 },
      { header: "DNI", key: "dni", width: 15 },
      { header: "Vendedor", key: "user", width: 20 },
      { header: "Estado", key: "status", width: 14 },
      { header: "Subtotal", key: "subtotal", width: 14 },
      { header: "Descuento", key: "discount", width: 14 },
      { header: "Total", key: "total", width: 14 },
      { header: "Método pago", key: "payment", width: 20 },
      { header: "Ganancia bruta", key: "profit", width: 16 },
    ];
    headerStyle(ws);

    for (const s of sales) {
      const clientName = s.client
        ? `${s.client.nombre} ${s.client.apellido}`.trim()
        : "Consumidor final";
      const discountAmt =
        s.discountValue != null && s.discountType
          ? s.discountType === "PERCENTAGE"
            ? toARS((s.subtotal ?? 0) * (s.discountValue / 100))
            : toARS(s.discountValue)
          : 0;
      const paymentMethods = s.payments.length
        ? s.payments.map((p) => p.method).join(", ")
        : (s.paymentMethod ?? "");

      ws.addRow({
        date: formatDate(s.createdAt),
        id: s.id,
        client: clientName,
        dni: s.client?.dni ?? "",
        user: s.user?.name ?? "",
        status: s.status,
        subtotal: toARS(s.subtotal),
        discount: discountAmt,
        total: toARS(s.total),
        payment: paymentMethods,
        profit: toARS(s.grossProfit),
      });
    }

    // Currency formatting
    ["subtotal", "discount", "total", "profit"].forEach((key) => {
      ws.getColumn(key).numFmt = '"$"#,##0.00';
    });

    // Sheet 2 — sale items detail
    const wsItems = wb.addWorksheet("Detalle de items");
    wsItems.columns = [
      { header: "Venta ID", key: "saleId", width: 36 },
      { header: "Fecha", key: "date", width: 22 },
      { header: "Producto", key: "product", width: 30 },
      { header: "SKU", key: "sku", width: 14 },
      { header: "Cantidad", key: "qty", width: 12 },
      { header: "Precio unit.", key: "price", width: 14 },
      { header: "Subtotal", key: "subtotal", width: 14 },
      { header: "Costo unit.", key: "cost", width: 14 },
      { header: "Ganancia", key: "profit", width: 14 },
    ];
    headerStyle(wsItems);

    for (const s of sales) {
      for (const item of s.items) {
        const qty = item.quantityKg != null ? item.quantityKg : item.quantity;
        wsItems.addRow({
          saleId: s.id,
          date: formatDate(s.createdAt),
          product: item.product?.name ?? item.productNameSnapshot ?? "",
          sku: item.product?.sku ?? item.productSkuSnapshot ?? "",
          qty,
          price: toARS(item.price),
          subtotal: toARS(item.subtotal),
          cost: toARS(item.purchasePriceSnapshot),
          profit: toARS(item.profit),
        });
      }
    }
    ["price", "subtotal", "cost", "profit"].forEach((key) => {
      wsItems.getColumn(key).numFmt = '"$"#,##0.00';
    });

    return wb.xlsx.writeBuffer();
  },

  async exportInventory() {
    const products = await prisma.product.findMany({
      where: { ...tenantScope() },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: { category: { select: { name: true } } },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = "ComarPOS";
    const ws = wb.addWorksheet("Inventario");
    ws.columns = [
      { header: "Nombre", key: "name", width: 32 },
      { header: "SKU", key: "sku", width: 14 },
      { header: "Categoría", key: "category", width: 20 },
      { header: "Tipo", key: "type", width: 12 },
      { header: "Unidad", key: "unit", width: 12 },
      { header: "Activo", key: "active", width: 10 },
      { header: "Stock local (u)", key: "stockLocal", width: 16 },
      { header: "Stock depósito (u)", key: "stockDeposito", width: 18 },
      { header: "Stock local (kg)", key: "stockLocalKg", width: 16 },
      { header: "Stock depósito (kg)", key: "stockDepositoKg", width: 18 },
      { header: "Stock mín. local", key: "minStock", width: 16 },
      { header: "Precio minorista", key: "price", width: 16 },
      { header: "Precio mayorista", key: "wholesale", width: 16 },
      { header: "Precio compra", key: "purchasePrice", width: 16 },
    ];
    headerStyle(ws);

    for (const p of products) {
      const row = ws.addRow({
        name: p.name,
        sku: p.sku ?? "",
        category: p.category?.name ?? "",
        type: p.type,
        unit: p.saleUnit,
        active: p.isActive ? "Sí" : "No",
        stockLocal: p.stockLocal,
        stockDeposito: p.stockDeposito,
        stockLocalKg: p.stockLocalKg,
        stockDepositoKg: p.stockDepositoKg,
        minStock: p.minStock ?? "",
        price: toARS(p.price),
        wholesale: toARS(p.wholesalePrice),
        purchasePrice: toARS(p.purchasePrice),
      });

      // Highlight low-stock rows
      const isLow =
        (p.minStock != null && p.stockLocal < p.minStock) ||
        (p.minStockKg != null && p.stockLocalKg < p.minStockKg);
      if (isLow) {
        row.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFCCCC" } };
        });
      }
    }

    ["price", "wholesale", "purchasePrice"].forEach((key) => {
      ws.getColumn(key).numFmt = '"$"#,##0.00';
    });

    return wb.xlsx.writeBuffer();
  },

  async exportPurchases(params?: { fromDate?: Date; toDate?: Date }) {
    const where: any = { ...tenantScope() };
    if (params?.fromDate || params?.toDate) {
      where.createdAt = {};
      if (params?.fromDate) where.createdAt.gte = params.fromDate;
      if (params?.toDate) where.createdAt.lte = params.toDate;
    }

    const purchases = await prisma.purchase.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        supplier: { select: { name: true, cuit: true } },
        user: { select: { name: true } },
        items: { include: { product: { select: { name: true, sku: true } } } },
      },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = "ComarPOS";

    const ws = wb.addWorksheet("Compras");
    ws.columns = [
      { header: "Fecha", key: "date", width: 22 },
      { header: "ID", key: "id", width: 36 },
      { header: "Proveedor", key: "supplier", width: 28 },
      { header: "CUIT proveedor", key: "supplierCuit", width: 18 },
      { header: "Registrada por", key: "user", width: 20 },
      { header: "Total", key: "total", width: 14 },
      { header: "Método pago", key: "payment", width: 18 },
    ];
    headerStyle(ws);

    for (const p of purchases) {
      ws.addRow({
        date: formatDate(p.createdAt),
        id: p.id,
        supplier: p.supplier?.name ?? "",
        supplierCuit: p.supplier?.cuit ?? "",
        user: p.user?.name ?? "",
        total: toARS(p.totalAmount),
        payment: p.paymentMethod ?? "",
      });
    }
    ws.getColumn("total").numFmt = '"$"#,##0.00';

    // Detail sheet
    const wsItems = wb.addWorksheet("Items de compra");
    wsItems.columns = [
      { header: "Compra ID", key: "purchaseId", width: 36 },
      { header: "Fecha", key: "date", width: 22 },
      { header: "Producto", key: "product", width: 30 },
      { header: "SKU", key: "sku", width: 14 },
      { header: "Cantidad", key: "qty", width: 12 },
      { header: "Precio unit.", key: "unitPrice", width: 14 },
      { header: "Subtotal", key: "subtotal", width: 14 },
    ];
    headerStyle(wsItems);

    for (const p of purchases) {
      for (const item of p.items) {
        wsItems.addRow({
          purchaseId: p.id,
          date: formatDate(p.createdAt),
          product: item.product?.name ?? "",
          sku: item.product?.sku ?? "",
          qty: item.quantity,
          unitPrice: toARS(item.unitCost),
          subtotal: toARS(item.subtotal),
        });
      }
    }
    ["unitPrice", "subtotal"].forEach((key) => {
      wsItems.getColumn(key).numFmt = '"$"#,##0.00';
    });

    return wb.xlsx.writeBuffer();
  },

  async exportFinance(params?: { fromDate?: Date; toDate?: Date }) {
    const where: any = { ...tenantScope() };
    if (params?.fromDate || params?.toDate) {
      where.date = {};
      if (params?.fromDate) where.date.gte = params.fromDate;
      if (params?.toDate) where.date.lte = params.toDate;
    }

    const entries = await prisma.finance.findMany({
      where,
      orderBy: { date: "desc" },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = "ComarPOS";
    const ws = wb.addWorksheet("Finanzas");
    ws.columns = [
      { header: "Fecha", key: "date", width: 22 },
      { header: "Tipo", key: "type", width: 12 },
      { header: "Categoría", key: "category", width: 20 },
      { header: "Monto", key: "amount", width: 14 },
      { header: "Método pago", key: "payment", width: 18 },
      { header: "Descripción", key: "description", width: 40 },
    ];
    headerStyle(ws);

    for (const e of entries) {
      const row = ws.addRow({
        date: formatDate(e.date),
        type: e.type,
        category: e.category,
        amount: toARS(e.amount),
        payment: e.paymentMethod ?? "",
        description: e.description ?? "",
      });

      // Color by type
      const color = e.type === "INGRESO" ? "FFE8F5E9" : "FFFFEBEE";
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
      });
    }
    ws.getColumn("amount").numFmt = '"$"#,##0.00';

    return wb.xlsx.writeBuffer();
  },
};
