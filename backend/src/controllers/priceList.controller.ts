import { Request, Response, NextFunction } from "express";
import { priceListService } from "../services/priceList.service";
import { logAudit } from "../utils/auditLogger";

function wrap(fn: (req: Request, res: Response) => Promise<any>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await fn(req, res)); } catch (err) { next(err); }
  };
}

export const priceListController = {
  getAll: wrap(async () => priceListService.getAll()),

  getById: wrap(async (req) => {
    const l = await priceListService.getById(req.params.id as string);
    if (!l) throw Object.assign(new Error("Lista de precios no encontrada"), { status: 404 });
    return l;
  }),

  create: wrap(async (req) => {
    const l = await priceListService.create(req.body);
    logAudit(req, "CREATE", "PriceList", l.id, { name: l.name });
    return l;
  }),

  update: wrap(async (req) => {
    const l = await priceListService.update(req.params.id as string, req.body);
    logAudit(req, "UPDATE", "PriceList", req.params.id as string, req.body);
    return l;
  }),

  remove: wrap(async (req) => {
    const l = await priceListService.remove(req.params.id as string);
    logAudit(req, "DELETE", "PriceList", req.params.id as string);
    return l;
  }),

  upsertItem: wrap(async (req) => {
    const item = await priceListService.upsertItem({ priceListId: req.params.id as string, ...req.body });
    logAudit(req, "UPDATE_ITEM", "PriceList", req.params.id as string, { productId: item.productId, price: item.price });
    return item;
  }),

  removeItem: wrap(async (req) => {
    const item = await priceListService.removeItem(req.params.id as string, req.params.productId as string);
    logAudit(req, "REMOVE_ITEM", "PriceList", req.params.id as string, { productId: req.params.productId });
    return item;
  }),

  setAllItems: wrap(async (req) => {
    const l = await priceListService.setAllItems(req.params.id as string, req.body.items);
    logAudit(req, "BULK_SET_ITEMS", "PriceList", req.params.id as string, { itemCount: req.body.items?.length });
    return l;
  }),

  assignToClient: wrap(async (req) => {
    const c = await priceListService.assignToClient(req.params.clientId as string, req.body.priceListId);
    logAudit(req, "ASSIGN_CLIENT", "PriceList", req.body.priceListId ?? "none", { clientId: req.params.clientId });
    return c;
  }),

  getPriceForClient: wrap(async (req) => {
    const price = await priceListService.getPriceForClient(
      req.params.clientId as string,
      req.params.productId as string
    );
    return { price };
  }),
};
