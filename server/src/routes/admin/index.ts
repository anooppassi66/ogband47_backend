import { Router } from "express";
import { requireAdmin } from "../../middleware/auth.js";
import {
  getOrderStats,
  getOrderStatusBreakdown,
  getRevenueLast14Days,
  listAdminOrders,
} from "../../services/orders.js";
import { getProductSalesReport, listAdminProducts } from "../../services/products.js";
import { getCustomerCount, listCustomers } from "../../services/users.js";
import { adminAuthRouter } from "./auth.js";
import { adminOrdersRouter } from "./orders.js";
import { adminProductsRouter } from "./products.js";

export const adminRouter = Router();

// /auth/login is public; everything after this line requires an admin token.
adminRouter.use("/auth", adminAuthRouter);
adminRouter.use(requireAdmin);

adminRouter.use("/products", adminProductsRouter);
adminRouter.use("/orders", adminOrdersRouter);

/** Everything the admin dashboard page shows, in one request. */
adminRouter.get("/dashboard", async (_req, res) => {
  const [products, orders, stats, revenueLast14Days, statusBreakdown, customerCount] = await Promise.all([
    listAdminProducts(),
    listAdminOrders(),
    getOrderStats(),
    getRevenueLast14Days(),
    getOrderStatusBreakdown(),
    getCustomerCount(),
  ]);

  // Same selections as app/admin/(dashboard)/page.tsx.
  const topProducts = products
    .filter((p) => p.label === "BESTSELLER")
    .concat(products.filter((p) => p.label !== "BESTSELLER"))
    .slice(0, 4);
  const lowStockProducts = products
    .filter((p) => p.status !== "In Stock")
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 6);

  res.json({
    stats: { ...stats, customerCount },
    revenueLast14Days,
    statusBreakdown,
    recentOrders: orders.slice(0, 5),
    topProducts,
    lowStockProducts,
  });
});

adminRouter.get("/reports/product-sales", async (_req, res) => {
  res.json({ report: await getProductSalesReport() });
});

adminRouter.get("/customers", async (_req, res) => {
  res.json({ customers: await listCustomers() });
});
