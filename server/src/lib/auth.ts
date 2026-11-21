import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { sessions, users } from "../db/schema.js";

// Same session store as the website: an opaque random token in the
// `sessions` table. The website puts it in a cookie; mobile clients send it
// as `Authorization: Bearer <token>`. Either way it's the same session.
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7; // 7 days, same as the website

export type Role = "customer" | "admin";

/** A user as exposed to API clients — never includes the password hash. */
export type PublicUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  gender: string | null;
  createdAt: Date;
};

const publicUserColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  gender: users.gender,
  createdAt: users.createdAt,
};

export function toPublicUser(user: typeof users.$inferSelect): PublicUser {
  const { passwordHash: _omit, ...rest } = user;
  return rest;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await db.insert(sessions).values({ id: token, userId, expiresAt });
  return { token, expiresAt };
}

export async function getSessionUser(token: string | undefined): Promise<PublicUser | null> {
  if (!token) return null;

  const [row] = await db
    .select({ user: publicUserColumns, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, token))
    .limit(1);

  if (!row || row.expiresAt < new Date()) return null;
  return row.user;
}

export async function deleteSession(token: string) {
  await db.delete(sessions).where(eq(sessions.id, token));
}
