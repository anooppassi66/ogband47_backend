import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { orders, users } from "../db/schema.js";
import type { Role } from "../lib/auth.js";

export async function findUserByLogin(email: string, role: Role) {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), eq(users.role, role)))
    .limit(1);
  return user;
}

export async function emailExists(email: string): Promise<boolean> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  return Boolean(row);
}

export async function createCustomer(input: {
  name: string;
  email: string;
  passwordHash: string;
  gender: "male" | "female" | null;
}) {
  const [user] = await db
    .insert(users)
    .values({ ...input, role: "customer" })
    .returning();
  return user;
}

export async function getCustomerCount(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(eq(users.role, "customer"));
  return Number(row?.count ?? 0);
}

/** Registered customers with their order count and lifetime spend, newest first. */
export async function listCustomers() {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      gender: users.gender,
      createdAt: users.createdAt,
      orderCount: sql<number>`count(${orders.id})`,
      totalSpent: sql<number>`coalesce(sum(${orders.total}), 0)`,
    })
    .from(users)
    .leftJoin(orders, eq(orders.userId, users.id))
    .where(eq(users.role, "customer"))
    .groupBy(users.id)
    .orderBy(desc(users.createdAt));

  return rows.map((r) => ({ ...r, orderCount: Number(r.orderCount), totalSpent: Number(r.totalSpent) }));
}
