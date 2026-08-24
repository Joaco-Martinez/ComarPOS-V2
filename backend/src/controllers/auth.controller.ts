import { Request, Response, NextFunction } from "express";
import { authService } from "../services/auth.service";
import { getParamAsString } from "../utils/params";

export const authController = {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await authService.register(
        {
          email: req.body.email,
          password: req.body.password,
          nombre: req.body.nombre,
          apellido: req.body.apellido,
          name: req.body.name,
          dni: req.body.dni,
          telefono: req.body.telefono,
        },
        (req as any).tenantId
      );

      res.status(201).json({
        ok: true,
        content: user,
      });
    } catch (err) {
      next(err);
    }
  },

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;
      const result = await authService.login(email, password, res);

      res.json({
        ok: true,
        content: result,
      });
    } catch (err) {
      next(err);
    }
  },

  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;

      const result = await authService.changePassword(
        userId,
        req.body.currentPassword,
        req.body.newPassword,
        res
      );

      res.json({
        ok: true,
        content: result,
      });
    } catch (err) {
      next(err);
    }
  },

  async updateQuickAccess(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;
      const result = await authService.updateQuickAccessConfig(userId, req.body.config);

      res.json({
        ok: true,
        content: result,
      });
    } catch (err) {
      next(err);
    }
  },

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.logout(res);

      res.json({
        ok: true,
        content: result,
      });
    } catch (err) {
      next(err);
    }
  },

  async me(req: Request, res: Response) {
    try {
      const user = await authService.me(req);

      res.json({
        ok: true,
        content: user,
      });
    } catch {
      // Sin sesion valida (sin token, token vencido/invalido, usuario
      // deshabilitado/borrado) es trafico anonimo normal - 401, no un error
      // de servidor. El frontend llama esto en cada carga para saber si hay
      // sesion, asi que no vale la pena distinguir el motivo puntual.
      res.clearCookie("token", { path: "/" });
      res.clearCookie("user", { path: "/" });
      res.status(401).json({ ok: false, message: "No autenticado" });
    }
  },

  async deleteUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await authService.deleteUser(getParamAsString(id, "id"));

      res.json({
        ok: true,
        content: result,
      });
    } catch (err) {
      next(err);
    }
  },
};
