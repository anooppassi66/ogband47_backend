import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { orderItems, orders, products, users } from "../db/schema.js";
import { FLAT_SHIPPING_FEE, FREE_SHIPPING_THRESHOLD, ORDER_STATUSES, type OrderStatus } from "../lib/constants.js";
import { HttpError } from "../lib/http-error.js";
import { productImageUrl } from "../lib/images.js";
import { createAddress, getAddress, type Address, type AddressInput } from "./addresses.js";

// Port of ../../../lib/orders.ts.

export function formatOrderId(id: number): string {
  return `OGB-${10000 + id}`;
}

type OrderRow = typeof orders.$inferSelect;
type OrderItemRow = typeof orderItems.$inferSelect;

function serializeOrder(order: OrderRow, items: OrderItemRow[]) {
  return {
    ...order,
    displayId: formatOrderId(order.id),
    items: items.map((item) => ({ ...item, imageUrl: productImageUrl(item.imageId) })),
  };
}

export type Order = ReturnType<typeof serializeOrder>;

export type PlaceOrderInput = {
  userId: number;
  addressId?: number;
  newAddress?: AddressInput;
  items: { id: string; qty: number }[];
};

/** Prices come from the database, never the client. Runs in one transaction,
 * so a failure part-way leaves no half-created order, address or stock change. */
export async function placeOrder(input: PlaceOrderInput): Promise<Order> {
  if (input.items.length === 0) throw new HttpError(400, "Your bag is empty.");

  return db.transaction(async (tx) => {
    let shipping: Address | undefined;
    if (input.addressId) {
      shipping = await getAddress(input.userId, input.addressId, tx);
      if (!shipping) throw new HttpError(400, "That address could not be found.");
    } else if (input.newAddress) {
      shipping = await createAddress(input.userId, input.newAddress, tx);
    } else {
      throw new HttpError(400, "Please choose or add a delivery address.");
    }

    const ids = [...new Set(input.items.map((i) => i.id))];
    const catalog = await tx.select().from(products).where(inArray(products.id, ids));
    const byId = new Map(catalog.map((p) => [p.id, p]));

    const lines = input.items.map((line) => {
      const product = byId.get(line.id);
      if (!product) throw new HttpError(400, "One of the items in your bag is no longer available.");
      return { product, qty: Math.max(1, line.qty) };
    });

    const subtotal = lines.reduce((sum, l) => sum + l.product.price * l.qty, 0);
    const shippingCost = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_FEE;

    const [order] = await tx
      .insert(orders)
      .values({
        userId: input.userId,
        subtotal,
        shipping: shippingCost,
        total: subtotal + shippingCost,
        shippingName: shipping.fullName,
        shippingPhone: shipping.phone,
        shippingLine1: shipping.line1,
        shippingLine2: shipping.line2,
        shippingCity: shipping.city,
        shippingState: shipping.state,
        shippingPostalCode: shipping.postalCode,
        shippingCountry: shipping.country,
      })
      .returning();

    const items = await tx
      .insert(orderItems)
      .values(
        lines.map((l) => ({
          orderId: order.id,
          productId: l.product.id,
          name: l.product.name,
          imageId: l.product.imageId,
          category: l.product.category,
          price: l.product.price,
          qty: l.qty,
        }))
      )
      .returning();

    for (const l of lines) {
      await tx
        .update(products)
        .set({ stock: sql`greatest(${products.stock} - ${l.qty}, 0)` })
        .where(eq(products.id, l.product.id));
    }

    return serializeOrder(order, items);
  });
}

async function itemsByOrder(orderIds: number[]): Promise<Map<number, OrderItemRow[]>> {
  const grouped = new Map<number, OrderItemRow[]>();
  if (orderIds.length === 0) return grouped;

  const rows = await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds));
  for (const row of rows) {
    const list = grouped.get(row.orderId) ?? [];
    list.push(row);
    grouped.set(row.orderId, list);
  }
  return grouped;
}

/** A customer's orders, newest first, each with its items. */
export async function listOrdersForUser(userId: number): Promise<Order[]> {
  const rows = await db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt));
  const items = await itemsByOrder(rows.map((r) => r.id));
  return rows.map((order) => serializeOrder(order, items.get(order.id) ?? []));
}

/** Pass `userId` to only return the order if it belongs to that customer. */
export async function getOrderById(id: number, userId?: number): Promise<Order | undefined> {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, id), userId !== undefined ? eq(orders.userId, userId) : undefined))
    .limit(1);
  if (!order) return undefined;

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
  return serializeOrder(order, items);
}

// --- Admin ---

export type AdminOrder = {
  id: number;
  displayId: string;
  customer: string;
  email: string;
  date: string;
  items: number;
  total: number;
  status: string;
};

export async function listAdminOrders(): Promise<AdminOrder[]> {
  const rows = await db
    .select({
      id: orders.id,
      total: orders.total,
      status: orders.status,
      createdAt: orders.createdAt,
      customer: users.name,
      email: users.email,
      itemCount: sql<number>`coalesce((select sum(${orderItems.qty}) from ${orderItems} where ${orderItems.orderId} = ${orders.id}), 0)`,
    })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .orderBy(desc(orders.createdAt));

  return rows.map((r) => ({
    id: r.id,
    displayId: formatOrderId(r.id),
    customer: r.customer,
    email: r.email,
    date: r.createdAt.toISOString().slice(0, 10),
    items: Number(r.itemCount),
    total: r.total,
    status: r.status,
  }));
}

/** Returns false if no order had that id. */
export async function updateOrderStatus(id: number, status: OrderStatus): Promise<boolean> {
  const rows = await db.update(orders).set({ status }).where(eq(orders.id, id)).returning({ id: orders.id });
  return rows.length > 0;
}

export type OrderCustomerContact = {
  id: number;
  status: string;
  total: number;
  customerName: string;
  customerEmail: string;
};

export async function getOrderCustomerContact(id: number): Promise<OrderCustomerContact | undefined> {
  const [row] = await db
    .select({
      id: orders.id,
      status: orders.status,
      total: orders.total,
      customerName: users.name,
      customerEmail: users.email,
    })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .where(eq(orders.id, id))
    .limit(1);
  return row;
}

export async function getOrderStats() {
  const [row] = await db
    .select({
      revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
      orderCount: sql<number>`count(*)`,
      delivered: sql<number>`coalesce(sum(case when ${orders.status} = 'Delivered' then 1 else 0 end), 0)`,
    })
    .from(orders);

  return {
    revenue: Number(row?.revenue ?? 0),
    orderCount: Number(row?.orderCount ?? 0),
    delivered: Number(row?.delivered ?? 0),
  };
}

export async function getRevenueLast14Days() {
  const since = new Date();
  since.setDate(since.getDate() - 13);
  since.setHours(0, 0, 0, 0);

  const rows = await db
    .select({
      day: sql<string>`to_char(${orders.createdAt}, 'YYYY-MM-DD')`,
      revenue: sql<number>`sum(${orders.total})`,
    })
    .from(orders)
    .where(gte(orders.createdAt, since))
    .groupBy(sql`to_char(${orders.createdAt}, 'YYYY-MM-DD')`);

  const byDay = new Map(rows.map((r) => [r.day, Number(r.revenue)]));
  const days: { day: string; revenue: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ day: key, revenue: byDay.get(key) ?? 0 });
  }
  return days;
}

export async function getOrderStatusBreakdown() {
  const rows = await db
    .select({ status: orders.status, count: sql<number>`count(*)` })
    .from(orders)
    .groupBy(orders.status);

  const counts = new Map(rows.map((r) => [r.status, Number(r.count)]));
  return ORDER_STATUSES.map((status) => ({ status, count: counts.get(status) ?? 0 }));
}
