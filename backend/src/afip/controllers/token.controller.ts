/**
 * Handlers de diagnostico/token AFIP.
 * Extraidos de afip.controller.ts (doc seccion 4.3 - modularizacion).
 */
import { Request, Response } from "express";
import { generarTokenAFIP } from "../wsaa.service";

export async function tokenController(_req: Request, res: Response) {
  try {
    const data = await generarTokenAFIP();
    res.json({ ok: true, data });
  } catch (err: any) {
    console.error("❌ Error detallado en /afip/token:", err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
}

export async function pruebaController(_req: Request, res: Response) {
  res.json({ ok: true, message: "La ruta de prueba funciona correctamente." });
}
