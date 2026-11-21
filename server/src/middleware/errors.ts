import type { ErrorRequestHandler, RequestHandler } from "express";
import multer from "multer";
import { HttpError } from "../lib/http-error.js";

export const notFound: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, `No route for ${req.method} ${req.path}.`));
};

/** Every error leaves the API as `{ error: string, fields?: { [field]: string[] } }`. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, ...(err.fields ? { fields: err.fields } : {}) });
    return;
  }

  // Malformed JSON body from express.json().
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: "Request body is not valid JSON." });
    return;
  }
  if (err?.type === "entity.too.large") {
    res.status(413).json({ error: "Request body is too large." });
    return;
  }

  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE" ? "Photo must be 10 MB or smaller." : err.message;
    res.status(400).json({ error: message });
    return;
  }

  // Postgres unique violation, e.g. two signups racing on the same email.
  if (err?.code === "23505" || err?.cause?.code === "23505") {
    res.status(409).json({ error: "That record already exists." });
    return;
  }

  console.error(err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
};
