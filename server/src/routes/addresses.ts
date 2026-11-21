import { Router } from "express";
import { HttpError } from "../lib/http-error.js";
import { parse, parseId } from "../lib/validate.js";
import { currentUser, requireCustomer } from "../middleware/auth.js";
import { createAddress, deleteAddress, getAddress, listAddresses, updateAddress } from "../services/addresses.js";
import { addressSchema } from "./schemas.js";

// A customer's saved delivery addresses. Every query is scoped to the
// signed-in user, so one customer can never read or change another's.

export const addressesRouter = Router();
addressesRouter.use(requireCustomer);

addressesRouter.get("/", async (req, res) => {
  res.json({ addresses: await listAddresses(currentUser(req).id) });
});

addressesRouter.get("/:id", async (req, res) => {
  const address = await getAddress(currentUser(req).id, parseId(req.params.id, "Address"));
  if (!address) throw new HttpError(404, "Address not found.");
  res.json({ address });
});

addressesRouter.post("/", async (req, res) => {
  const address = await createAddress(currentUser(req).id, parse(addressSchema, req.body));
  res.status(201).json({ address });
});

addressesRouter.put("/:id", async (req, res) => {
  const id = parseId(req.params.id, "Address");
  const address = await updateAddress(currentUser(req).id, id, parse(addressSchema, req.body));
  if (!address) throw new HttpError(404, "Address not found.");
  res.json({ address });
});

addressesRouter.delete("/:id", async (req, res) => {
  const deleted = await deleteAddress(currentUser(req).id, parseId(req.params.id, "Address"));
  if (!deleted) throw new HttpError(404, "Address not found.");
  res.status(204).end();
});
