import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../lib/http-error.js";
import { parse, parseId } from "../lib/validate.js";
import { currentUser, requireCustomer } from "../middleware/auth.js";
import { notifyOrderPlaced } from "../services/notifications.js";
import { getOrderById, listOrdersForUser, placeOrder } from "../services/orders.js";
import { addressSchema } from "./schemas.js";

// Mirrors placeOrderAction in app/actions/orders.ts, plus order history.

const placeOrderSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        qty: z.number().int().min(1).max(99),
      })
    )
    .min(1, "Your bag is empty."),
  addressId: z.number().int().positive().optional(),
  newAddress: addressSchema.optional(),
});

export const ordersRouter = Router();
ordersRouter.use(requireCustomer);

ordersRouter.get("/", async (req, res) => {
  res.json({ orders: await listOrdersForUser(currentUser(req).id) });
});

ordersRouter.get("/:id", async (req, res) => {
  const order = await getOrderById(parseId(req.params.id, "Order"), currentUser(req).id);
  if (!order) throw new HttpError(404, "Order not found.");
  res.json({ order });
});

ordersRouter.post("/", async (req, res) => {
  const user = currentUser(req);
  const input = parse(placeOrderSchema, req.body);

  const order = await placeOrder({ userId: user.id, ...input });

  // Fire-and-forget: the confirmation email shouldn't delay the response.
  void notifyOrderPlaced({
    id: order.id,
    status: order.status,
    total: order.total,
    customerName: user.name,
    customerEmail: user.email,
  });

  res.status(201).json({ order });
});
