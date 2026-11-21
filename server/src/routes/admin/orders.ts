import { Router } from "express";
import { z } from "zod";
import { ORDER_STATUSES } from "../../lib/constants.js";
import { HttpError } from "../../lib/http-error.js";
import { parse, parseId } from "../../lib/validate.js";
import { notifyOrderStatusChange } from "../../services/notifications.js";
import {
  getOrderById,
  getOrderCustomerContact,
  listAdminOrders,
  updateOrderStatus,
} from "../../services/orders.js";

// Mirrors updateOrderStatusAction in app/actions/orders.ts and the admin order pages.

const statusSchema = z.object({ status: z.enum(ORDER_STATUSES) });

export const adminOrdersRouter = Router();

adminOrdersRouter.get("/", async (_req, res) => {
  res.json({ orders: await listAdminOrders() });
});

adminOrdersRouter.get("/:id", async (req, res) => {
  const id = parseId(req.params.id, "Order");
  const [order, contact] = await Promise.all([getOrderById(id), getOrderCustomerContact(id)]);
  if (!order) throw new HttpError(404, "Order not found.");
  res.json({
    order: {
      ...order,
      customer: contact ? { name: contact.customerName, email: contact.customerEmail } : null,
    },
  });
});

adminOrdersRouter.patch("/:id/status", async (req, res) => {
  const id = parseId(req.params.id, "Order");
  const { status } = parse(statusSchema, req.body);

  if (!(await updateOrderStatus(id, status))) throw new HttpError(404, "Order not found.");

  const contact = await getOrderCustomerContact(id);
  if (contact) void notifyOrderStatusChange(contact);

  res.json({ order: await getOrderById(id) });
});
