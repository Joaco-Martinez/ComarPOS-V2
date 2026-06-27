import { Router } from "express";
import { ticketController } from "../controllers/ticket.controller";
import { authMiddleware } from "../middleware/auth";

const router = Router();

router.use(authMiddleware);

router.post("/sale/:saleId/print", ticketController.printSaleTicket);

export default router;