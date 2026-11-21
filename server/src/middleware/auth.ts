import type { Request, RequestHandler } from "express";
import { getSessionUser, type PublicUser, type Role } from "../lib/auth.js";
import { HttpError } from "../lib/http-error.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: PublicUser;
      sessionToken?: string;
    }
  }
}

function bearerToken(req: Request): string | undefined {
  const match = req.get("authorization")?.match(/^Bearer\s+(\S+)\s*$/i);
  return match?.[1];
}

function requireRole(role: Role): RequestHandler {
  return async (req, _res, next) => {
    const token = bearerToken(req);
    const user = await getSessionUser(token);
    if (!user) throw new HttpError(401, "Please sign in to continue.");
    if (user.role !== role) throw new HttpError(403, "This account can't access this resource.");

    req.user = user;
    req.sessionToken = token;
    next();
  };
}

/** Requires `Authorization: Bearer <token>` from a customer login. */
export const requireCustomer = requireRole("customer");

/** Requires `Authorization: Bearer <token>` from an admin login. */
export const requireAdmin = requireRole("admin");

/** For use after requireCustomer / requireAdmin. */
export function currentUser(req: Request): PublicUser {
  if (!req.user) throw new HttpError(401, "Please sign in to continue.");
  return req.user;
}
