import { eq, ne, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { categories, orderItems, orders, products } from "../db/schema.js";
import { productImageUrl } from "../lib/images.js";
import type { Section } from "../lib/constants.js";

// Port of ../../../lib/products.ts.

type ProductRow = typeof products.$inferSelect;

export type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  originalPrice: number | null;
  imageId: string;
  imageUrl: string;
  label: string | null;
  section: string;
};

function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: row.price,
    originalPrice: row.originalPrice,
    imageId: row.imageId,
    imageUrl: productImageUrl(row.imageId),
    label: row.label,
    section: row.section,
  };
}

export async function listProducts(filter: { section?: Section } = {}): Promise<Product[]> {
  const rows = await db
    .select()
    .from(products)
    .where(filter.section ? eq(products.section, filter.section) : undefined);
  return rows.map(toProduct);
}

export async function getProductById(id: string): Promise<Product | undefined> {
  const [row] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return row ? toProduct(row) : undefined;
}

/** Same category first, then everything else — same rule as the website. */
export async function getRelatedProducts(product: Product, limit = 4): Promise<Product[]> {
  const rows = await db
    .select()
    .from(products)
    .where(ne(products.id, product.id))
    .orderBy(sql`case when ${products.category} = ${product.category} then 0 else 1 end`)
    .limit(limit);
  return rows.map(toProduct);
}

export async function listCategories() {
  return db.select().from(categories);
}

// --- Admin ---

export type AdminProduct = {
  id: string;
  name: string;
  category: string;
  price: number;
  imageId: string;
  imageUrl: string;
  label: string | null;
  stock: number;
  status: "In Stock" | "Low Stock" | "Out of Stock";
  section: string;
};

export function stockStatus(stock: number): AdminProduct["status"] {
  return stock === 0 ? "Out of Stock" : stock < 8 ? "Low Stock" : "In Stock";
}

function toAdminProduct(row: ProductRow): AdminProduct {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: row.price,
    imageId: row.imageId,
    imageUrl: productImageUrl(row.imageId),
    label: row.label,
    stock: row.stock,
    status: stockStatus(row.stock),
    section: row.section,
  };
}

export async function listAdminProducts(): Promise<AdminProduct[]> {
  const rows = await db.select().from(products);
  return rows.map(toAdminProduct);
}

export async function getAdminProduct(id: string): Promise<AdminProduct | undefined> {
  const [row] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return row ? toAdminProduct(row) : undefined;
}

export type ProductInput = {
  name: string;
  category: string;
  price: number;
  stock: number;
  label?: "NEW" | "BESTSELLER" | null;
  section: Section;
};

export async function createProduct(input: ProductInput & { imageId?: string }): Promise<AdminProduct> {
  const id = `p-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const [row] = await db
    .insert(products)
    .values({
      id,
      name: input.name,
      category: input.category,
      price: input.price,
      imageId: input.imageId || "1521572163474-6864f9cf17ab",
      label: input.label ?? null,
      section: input.section,
      stock: input.stock,
    })
    .returning();
  return toAdminProduct(row);
}

export async function updateProduct(id: string, input: ProductInput): Promise<AdminProduct | undefined> {
  const [row] = await db
    .update(products)
    .set({
      name: input.name,
      category: input.category,
      price: input.price,
      stock: input.stock,
      label: input.label ?? null,
      section: input.section,
    })
    .where(eq(products.id, id))
    .returning();
  return row ? toAdminProduct(row) : undefined;
}

/** Returns false if no product had that id. Past orders keep their own copy
 * of the product details, so deleting doesn't affect order history. */
export async function deleteProduct(id: string): Promise<boolean> {
  const rows = await db.delete(products).where(eq(products.id, id)).returning({ id: products.id });
  return rows.length > 0;
}

// --- Sales report ---

export type ProductSalesStat = {
  id: string;
  name: string;
  category: string;
  imageId: string;
  imageUrl: string;
  price: number;
  stock: number | null;
  label: string | null;
  status: AdminProduct["status"] | "Discontinued";
  unitsSold: number;
  revenue: number;
  orderCount: number;
  firstSoldAt: string | null;
  lastSoldAt: string | null;
  active: boolean;
};

function toDateStr(value: unknown): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Per-product sales, including products since removed from the catalog.
 * Sorted by revenue, highest first. */
export async function getProductSalesReport(): Promise<ProductSalesStat[]> {
  const [catalog, salesRows] = await Promise.all([
    db.select().from(products),
    db
      .select({
        productId: orderItems.productId,
        name: sql<string>`max(${orderItems.name})`,
        category: sql<string>`max(${orderItems.category})`,
        imageId: sql<string>`max(${orderItems.imageId})`,
        unitsSold: sql<number>`coalesce(sum(${orderItems.qty}), 0)`,
        revenue: sql<number>`coalesce(sum(${orderItems.qty} * ${orderItems.price}), 0)`,
        orderCount: sql<number>`count(distinct ${orderItems.orderId})`,
        firstSoldAt: sql<string>`min(${orders.createdAt})`,
        lastSoldAt: sql<string>`max(${orders.createdAt})`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .groupBy(orderItems.productId),
  ]);

  const salesById = new Map(salesRows.map((r) => [r.productId, r]));
  const catalogIds = new Set(catalog.map((p) => p.id));

  const fromCatalog: ProductSalesStat[] = catalog.map((p) => {
    const sale = salesById.get(p.id);
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      imageId: p.imageId,
      imageUrl: productImageUrl(p.imageId),
      price: p.price,
      stock: p.stock,
      label: p.label,
      status: stockStatus(p.stock),
      unitsSold: Number(sale?.unitsSold ?? 0),
      revenue: Number(sale?.revenue ?? 0),
      orderCount: Number(sale?.orderCount ?? 0),
      firstSoldAt: toDateStr(sale?.firstSoldAt),
      lastSoldAt: toDateStr(sale?.lastSoldAt),
      active: true,
    };
  });

  const discontinued: ProductSalesStat[] = salesRows
    .filter((r) => !catalogIds.has(r.productId))
    .map((r) => ({
      id: r.productId,
      name: r.name,
      category: r.category,
      imageId: r.imageId,
      imageUrl: productImageUrl(r.imageId),
      price: 0,
      stock: null,
      label: null,
      status: "Discontinued" as const,
      unitsSold: Number(r.unitsSold),
      revenue: Number(r.revenue),
      orderCount: Number(r.orderCount),
      firstSoldAt: toDateStr(r.firstSoldAt),
      lastSoldAt: toDateStr(r.lastSoldAt),
      active: false,
    }));

  return [...fromCatalog, ...discontinued].sort((a, b) => b.revenue - a.revenue);
}

