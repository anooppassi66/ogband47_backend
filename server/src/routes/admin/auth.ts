import { Router } from "express";
import { z } from "zod";
import { createSession, deleteSession, toPublicUser, verifyPassword } from "../../lib/auth.js";
import { HttpError } from "../../lib/http-error.js";
import { parse } from "../../lib/validate.js";
import { currentUser, requireAdmin } from "../../middleware/auth.js";
import { findUserByLogin } from "../../services/users.js";

// Mirrors app/actions/admin-auth.ts. Admins sign in with a username (stored
// in users.email — the seeded admin's is "admin"), so it isn't email-validated.

const loginSchema = z.object({
  username: z.string().trim().min(1, "Username is required."),
  password: z.string().min(1, "Password is required."),
});

export const adminAuthRouter = Router();

adminAuthRouter.post("/login", async (req, res) => {
  const { username, password } = parse(loginSchema, req.body);

  const user = await findUserByLogin(username, "admin");
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new HttpError(401, "Incorrect username or password.");
  }

  const session = await createSession(user.id);
  res.json({ ...session, user: toPublicUser(user) });
});

adminAuthRouter.post("/logout", requireAdmin, async (req, res) => {
  await deleteSession(req.sessionToken!);
  res.status(204).end();
});

adminAuthRouter.get("/me", requireAdmin, (req, res) => {
  res.json({ user: currentUser(req) });
});
