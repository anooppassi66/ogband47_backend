import { and, desc, eq } from "drizzle-orm";
import { db, type Executor } from "../db/index.js";
import { addresses } from "../db/schema.js";

export type Address = typeof addresses.$inferSelect;

export type AddressInput = {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
};

export async function listAddresses(userId: number): Promise<Address[]> {
  return db.select().from(addresses).where(eq(addresses.userId, userId)).orderBy(desc(addresses.createdAt));
}

export async function getAddress(userId: number, id: number, executor: Executor = db): Promise<Address | undefined> {
  const [row] = await executor
    .select()
    .from(addresses)
    .where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
    .limit(1);
  return row;
}

export async function createAddress(userId: number, input: AddressInput, executor: Executor = db): Promise<Address> {
  const [row] = await executor.insert(addresses).values({ userId, ...input }).returning();
  return row;
}

export async function updateAddress(userId: number, id: number, input: AddressInput): Promise<Address | undefined> {
  const [row] = await db
    .update(addresses)
    .set({ ...input, line2: input.line2 ?? null, country: input.country ?? "India" })
    .where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
    .returning();
  return row;
}

/** Orders keep their own copy of the shipping address, so this never alters order history. */
export async function deleteAddress(userId: number, id: number): Promise<boolean> {
  const rows = await db
    .delete(addresses)
    .where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
    .returning({ id: addresses.id });
  return rows.length > 0;
}
