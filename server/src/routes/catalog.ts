import { Router } from "express";
import { z } from "zod";
import { FLAT_SHIPPING_FEE, FREE_SHIPPING_THRESHOLD, ORDER_STATUSES, SECTIONS } from "../lib/constants.js";
import { HttpError } from "../lib/http-error.js";
import { parse } from "../lib/validate.js";
import { getProductById, getRelatedProducts, listCategories, listProducts } from "../services/products.js";

// Public, no auth. Mirrors lib/products.ts reads used by the storefront pages.

export const catalogRouter = Router();

/** Store settings the app needs to price a bag before checkout. */
catalogRouter.get("/config", (_req, res) => {
  res.json({
    currency: "INR",
    shipping: { freeShippingThreshold: FREE_SHIPPING_THRESHOLD, flatShippingFee: FLAT_SHIPPING_FEE },
    sections: SECTIONS,
    orderStatuses: ORDER_STATUSES,
  });
});

const listQuery = z.object({ section: z.enum(SECTIONS).optional() });

catalogRouter.get("/products", async (req, res) => {
  const { section } = parse(listQuery, req.query);
  res.json({ products: await listProducts({ section }) });
});

catalogRouter.get("/products/:id", async (req, res) => {
  const product = await getProductById(req.params.id);
  if (!product) throw new HttpError(404, "Product not found.");
  res.json({ product, related: await getRelatedProducts(product) });
});

catalogRouter.get("/categories", async (_req, res) => {
  res.json({ categories: await listCategories() });
});
