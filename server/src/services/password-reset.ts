import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { passwordResets, sessions, users } from "../db/schema.js";
import { createSession, hashPassword, toPublicUser } from "../lib/auth.js";
import { HttpError } from "../lib/http-error.js";
import { isMailConfigured } from "../lib/mail.js";
import { notifyPasswordChanged, notifyPasswordResetCode } from "./notifications.js";
import { findUserByLogin } from "./users.js";

// Forgot-password via a 6-digit code emailed to the customer.
//
// Brute-force limits: each code allows MAX_ATTEMPTS guesses, and a customer can
// get at most MAX_CODES_PER_HOUR codes, i.e. 25 guesses/hour against a 1-in-a-
// million code. Every timestamp is set from JS (not SQL now()), so comparisons
// are correct whatever the database's timezone setting is.

const CODE_TTL_MINUTES = 15;
const RESEND_COOLDOWN_MS = 60 * 1000;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_CODES_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

const EXPIRED = "That code has expired. Please request a new one.";
const LOCKED = "Too many incorrect attempts. Please request a new code.";

function hashCode(code: string): Buffer {
  return createHash("sha256").update(code).digest();
}

function codeError(message: string): HttpError {
  return new HttpError(400, message, { code: [message] });
}

/** Emails a reset code if `email` belongs to a customer. Silently does nothing
 * otherwise (or when rate-limited), so callers can't tell which emails exist. */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await findUserByLogin(email, "customer");
  if (!user) return;

  const now = Date.now();
  const recent = await db
    .select({ createdAt: passwordResets.createdAt })
    .from(passwordResets)
    .where(and(eq(passwordResets.userId, user.id), gte(passwordResets.createdAt, new Date(now - RATE_WINDOW_MS))))
    .orderBy(desc(passwordResets.createdAt));

  if (recent.length >= MAX_CODES_PER_HOUR) return;
  if (recent[0] && now - recent[0].createdAt.getTime() < RESEND_COOLDOWN_MS) return;

  // Rows older than the rate window aren't needed any more.
  await db
    .delete(passwordResets)
    .where(and(eq(passwordResets.userId, user.id), lt(passwordResets.createdAt, new Date(now - RATE_WINDOW_MS))));

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  await db.insert(passwordResets).values({
    userId: user.id,
    codeHash: hashCode(code).toString("hex"),
    expiresAt: new Date(now + CODE_TTL_MINUTES * 60 * 1000),
    createdAt: new Date(now),
  });

  if (!isMailConfigured() && process.env.NODE_ENV !== "production") {
    console.log(`[password-reset] SMTP not configured. Dev-only code for ${user.email}: ${code}`);
  }
  void notifyPasswordResetCode({ name: user.name, email: user.email, code, expiresInMinutes: CODE_TTL_MINUTES });
}

/** Checks `code` against the customer's latest reset code, using up one attempt. */
async function checkCode(email: string, code: string) {
  const user = await findUserByLogin(email, "customer");
  if (!user) throw codeError(EXPIRED);

  // Only the newest code counts; requesting a new code invalidates older ones.
  const [reset] = await db
    .select()
    .from(passwordResets)
    .where(eq(passwordResets.userId, user.id))
    .orderBy(desc(passwordResets.createdAt), desc(passwordResets.id))
    .limit(1);
  if (!reset || reset.usedAt || reset.expiresAt.getTime() < Date.now()) throw codeError(EXPIRED);

  // Count the attempt before comparing, atomically. Parallel guesses can't
  // all slip in under the limit.
  const [counted] = await db
    .update(passwordResets)
    .set({ attempts: sql`${passwordResets.attempts} + 1` })
    .where(and(eq(passwordResets.id, reset.id), lt(passwordResets.attempts, MAX_ATTEMPTS)))
    .returning({ attempts: passwordResets.attempts });
  if (!counted) throw codeError(LOCKED);

  if (!timingSafeEqual(Buffer.from(reset.codeHash, "hex"), hashCode(code))) {
    const left = MAX_ATTEMPTS - counted.attempts;
    throw codeError(left > 0 ? `That code is incorrect. ${left} ${left === 1 ? "attempt" : "attempts"} left.` : LOCKED);
  }

  return { user, reset };
}

/** Lets the app confirm the code before asking for a new password. Uses one attempt. */
export async function verifyResetCode(email: string, code: string): Promise<void> {
  await checkCode(email, code);
}

/** Sets the new password, signs the customer out everywhere (web included),
 * and returns a fresh session so the app can continue signed in. */
export async function resetPassword(email: string, code: string, newPassword: string) {
  const { user, reset } = await checkCode(email, code);
  const passwordHash = await hashPassword(newPassword);

  await db.transaction(async (tx) => {
    // Claim the code so two concurrent resets can't both use it.
    const [claimed] = await tx
      .update(passwordResets)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResets.id, reset.id), isNull(passwordResets.usedAt)))
      .returning({ id: passwordResets.id });
    if (!claimed) throw codeError(EXPIRED);

    await tx.update(users).set({ passwordHash }).where(eq(users.id, user.id));
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
    await tx.delete(passwordResets).where(eq(passwordResets.userId, user.id));
  });

  void notifyPasswordChanged({ name: user.name, email: user.email });

  const session = await createSession(user.id);
  return { ...session, user: toPublicUser(user) };
}
