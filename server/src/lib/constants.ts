// Business rules shared with the website. Keep in sync with
// ../../../lib/shipping.ts, ../../../lib/order-status.ts and ../../../lib/tryon.ts.

export const FREE_SHIPPING_THRESHOLD = 2999;
export const FLAT_SHIPPING_FEE = 149;

export const ORDER_STATUSES = ["Processing", "Shipped", "Delivered", "Cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const SECTIONS = ["trending", "new", "picked", "men", "women", "sale"] as const;
export type Section = (typeof SECTIONS)[number];

export const CLOTH_TYPES = ["upper", "lower", "full"] as const;
export type ClothType = (typeof CLOTH_TYPES)[number];

const FULL_CATEGORIES = new Set(["dresses"]);
const LOWER_CATEGORIES = new Set(["trousers"]);

/** Best-effort mapping from a product's category to Fitroom's cloth_type. */
export function clothTypeForCategory(category: string): ClothType {
  const c = category.toLowerCase();
  if (FULL_CATEGORIES.has(c)) return "full";
  if (LOWER_CATEGORIES.has(c)) return "lower";
  return "upper";
}
