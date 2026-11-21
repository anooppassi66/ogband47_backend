import { Router } from "express";
import { z } from "zod";
import { createSession, deleteSession, hashPassword, toPublicUser, verifyPassword } from "../lib/auth.js";
import { HttpError } from "../lib/http-error.js";
import { parse } from "../lib/validate.js";
import { currentUser, requireCustomer } from "../middleware/auth.js";
import { requestPasswordReset, resetPassword, verifyResetCode } from "../services/password-reset.js";
import { createCustomer, emailExists, findUserByLogin } from "../services/users.js";

// Mirrors app/actions/auth.ts. Passwords are trimmed exactly as the website
// does, so accounts created on either platform can sign in on the other.

const email = z.string().trim().pipe(z.email("Please enter a valid email."));
const newPassword = z.string().trim().min(6, "Password must be at least 6 characters long.");
const resetCode = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from your email.");

const signupSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters long."),
  email,
  password: newPassword,
  gender: z.enum(["male", "female"]).nullish(),
});

const loginSchema = z.object({
  email,
  password: z.string().trim().min(1, "Password is required."),
});

const forgotPasswordSchema = z.object({ email });
const verifyResetCodeSchema = z.object({ email, code: resetCode });
const resetPasswordSchema = z.object({ email, code: resetCode, password: newPassword });

export const authRouter = Router();

authRouter.post("/signup", async (req, res) => {
  const input = parse(signupSchema, req.body);

  if (await emailExists(input.email)) {
    throw new HttpError(409, "An account with this email already exists.", {
      email: ["An account with this email already exists."],
    });
  }

  const user = await createCustomer({
    name: input.name,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    gender: input.gender ?? null,
  });
  const session = await createSession(user.id);
  res.status(201).json({ ...session, user: toPublicUser(user) });
});

authRouter.post("/login", async (req, res) => {
  const input = parse(loginSchema, req.body);

  const user = await findUserByLogin(input.email, "customer");
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new HttpError(401, "Incorrect email or password.");
  }

  const session = await createSession(user.id);
  res.json({ ...session, user: toPublicUser(user) });
});

authRouter.post("/logout", requireCustomer, async (req, res) => {
  await deleteSession(req.sessionToken!);
  res.status(204).end();
});

authRouter.get("/me", requireCustomer, (req, res) => {
  res.json({ user: currentUser(req) });
});

// --- Forgot password: request a code → (optionally) verify it → set a new password ---

/** Always the same response, whether or not the email has an account. */
authRouter.post("/forgot-password", async (req, res) => {
  const input = parse(forgotPasswordSchema, req.body);
  await requestPasswordReset(input.email);
  res.json({ message: "If an account exists for that email, we've sent it a 6-digit code." });
});

authRouter.post("/verify-reset-code", async (req, res) => {
  const input = parse(verifyResetCodeSchema, req.body);
  await verifyResetCode(input.email, input.code);
  res.json({ valid: true });
});

authRouter.post("/reset-password", async (req, res) => {
  const input = parse(resetPasswordSchema, req.body);
  res.json(await resetPassword(input.email, input.code, input.password));
});
