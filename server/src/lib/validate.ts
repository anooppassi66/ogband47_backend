import { z } from "zod";
import { HttpError } from "./http-error.js";

/** Parses `data` with `schema`, or throws a 400 carrying per-field messages.
 * The top-level message is the first problem found, so clients can show it as-is. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const { formErrors, fieldErrors } = z.flattenError(result.error);
  const fields = fieldErrors as Record<string, string[]>;
  const firstFieldError = Object.values(fields).find((messages) => messages?.length)?.[0];
  throw new HttpError(400, formErrors[0] ?? firstFieldError ?? "Validation failed.", fields);
}

/** Parses a positive integer route param (e.g. an order id), or 404s. */
export function parseId(value: string, resource: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0 || id > 2_147_483_647) {
    throw new HttpError(404, `${resource} not found.`);
  }
  return id;
}
