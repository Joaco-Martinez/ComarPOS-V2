import { Request, Response } from "express";
import prisma from "../prisma";
import alertService from "../services/alert.service";
import { tenantScope } from "../utils/tenantScope";

export const getAlerts = async (req: Request, res: Response) => {
  try {
    const alerts = await alertService.getAlerts();
    res.json(alerts);
  } catch (error) {
    console.error("Error al obtener alertas:", error);
    res.status(500).json({ error: "Error al obtener alertas" });
  }
};

export const resolveAlert = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    // Alert no tiene tenantId propio: se scopea por el producto, si no se
    // podia resolver la alerta de otro negocio conociendo su id.
    const existing = await prisma.alert.findFirst({ where: { id, product: { ...tenantScope() } } });
    if (!existing) return res.status(404).json({ error: "Alerta no encontrada" });

    const alert = await prisma.alert.update({ where: { id }, data: { resolved: true } });
    res.json(alert);
  } catch (error) {
    console.error("Error al resolver alerta:", error);
    res.status(500).json({ error: "Error al resolver alerta" });
  }
};

export const checkAllStockAlerts = async (req: Request, res: Response) => {
  try {
    const alerts = await alertService.checkAllProductsStock();

    res.json({
      ok: true,
      message: "Alertas de stock revisadas correctamente",
      alerts,
    });
  } catch (error) {
    console.error("Error al revisar alertas de stock:", error);
    res.status(500).json({ error: "Error al revisar alertas de stock" });
  }
};