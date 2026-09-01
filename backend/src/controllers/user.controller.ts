import { Request, Response, NextFunction } from "express";
import { userService } from "../services/user.service";
import { getParamAsString } from "../utils/params";
import { logAudit } from "../utils/auditLogger";

function toNumberOrNull(value: any) {
  if (value === undefined || value === null || value === "") return undefined;

  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function toBoolean(value: any) {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return Boolean(value);
}

function safeJson(data: any) {
  return JSON.parse(
    JSON.stringify(data, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );
}

export const userController = {
  async getAll(_req: Request, res: Response, next: NextFunction) {
    try {
      const users = await userService.getAll();
      res.json(safeJson(users));
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await userService.getById(
        getParamAsString(req.params.id, "id")
      );

      if (!user) {
        return res.status(404).json({
          message: "Usuario no encontrado",
        });
      }

      res.json(safeJson(user));
    } catch (err) {
      next(err);
    }
  },

  async getActivityById(req: Request, res: Response, next: NextFunction) {
    try {
      const activity = await userService.getActivityById(
        getParamAsString(req.params.id, "id"),
        {
          fromDate:
            typeof req.query.fromDate === "string"
              ? req.query.fromDate
              : undefined,
          toDate:
            typeof req.query.toDate === "string"
              ? req.query.toDate
              : undefined,
        }
      );

      if (!activity) {
        return res.status(404).json({
          message: "Usuario no encontrado",
        });
      }

      res.json(safeJson(activity));
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const newUser = await userService.create({
        ...req.body,
        creditLimit: toNumberOrNull(req.body.creditLimit),
        isAccountEnabled: toBoolean(req.body.isAccountEnabled),
        isActive: toBoolean(req.body.isActive),
        restrictToDefaultLocation: toBoolean(req.body.restrictToDefaultLocation),
      });
      logAudit(req, "CREATE", "User", newUser.id, { email: newUser.email, role: newUser.role });
      res.status(201).json(safeJson(newUser));
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const body = { ...req.body };

      if (body.isActive !== undefined) {
        body.isActive = toBoolean(body.isActive);
      }

      if (body.restrictToDefaultLocation !== undefined) {
        body.restrictToDefaultLocation = toBoolean(body.restrictToDefaultLocation);
      }

      const updated = await userService.update(
        getParamAsString(req.params.id, "id"),
        body
      );
      logAudit(req, "UPDATE", "User", getParamAsString(req.params.id, "id"), {
        role: body.role,
        isActive: body.isActive,
      });
      res.json(safeJson(updated));
    } catch (err) {
      next(err);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = getParamAsString(req.params.id, "id");
      await userService.delete(id);
      logAudit(req, "DELETE", "User", id);
      res.json({
        message: "Usuario eliminado",
      });
    } catch (err) {
      next(err);
    }
  },
};