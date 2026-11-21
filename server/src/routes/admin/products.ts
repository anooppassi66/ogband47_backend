import { Router } from "express";
import { z } from "zod";
import { SECTIONS } from "../../lib/constants.js";
import { HttpError } from "../../lib/http-error.js";
import { parse } from "../../lib/validate.js";
import { notifyNewProductAdded } from "../../services/notifications.js";
import {
  createProduct,
  deleteProduct,
  getAdminProduct,
  listAdminProducts,
  updateProduct,
} from "../../services/products.js";

// Mirrors app/actions/admin-products.ts.

const productSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  category: z.string().trim().min(1, "Category is required."),
  price: z.number().int().positive("Price must be greater than 0."),
  stock: z.number().int().min(0, "Stock can't be negative."),
  label: z.enum(["NEW", "BESTSELLER"]).nullish(),
  section: z.enum(SECTIONS),
});

const createSchema = productSchema.extend({
  imageId: z.string().trim().min(1).optional(),
});

export const adminProductsRouter = Router();

adminProductsRouter.get("/", async (_req, res) => {
  res.json({ products: await listAdminProducts() });
});

adminProductsRouter.get("/:id", async (req, res) => {
  const product = await getAdminProduct(req.params.id);
  if (!product) throw new HttpError(404, "Product not found.");
  res.json({ product });
});

adminProductsRouter.post("/", async (req, res) => {
  const product = await createProduct(parse(createSchema, req.body));
  // Emails the matching customer audience; fire-and-forget so a large
  // mailing list doesn't hold up the response.
  void notifyNewProductAdded(product);
  res.status(201).json({ product });
});

adminProductsRouter.put("/:id", async (req, res) => {
  const product = await updateProduct(req.params.id, parse(productSchema, req.body));
  if (!product) throw new HttpError(404, "Product not found.");
  res.json({ product });
});

adminProductsRouter.delete("/:id", async (req, res) => {
  if (!(await deleteProduct(req.params.id))) throw new HttpError(404, "Product not found.");
  res.status(204).end();
});
