import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { unsplash } from "../lib/images.js";
import { escapeHtml as esc, sendBulkMail, sendMail, siteUrl, wrapEmail } from "../lib/mail.js";
import { formatOrderId, type OrderCustomerContact } from "./orders.js";

// Port of ../../../lib/notifications.ts. Every function here swallows its own
// errors, so callers can fire-and-forget without risking an unhandled rejection.

function formatPrice(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

const BUTTON_STYLE =
  "display:inline-block;background:#1c1a16;color:#f4f1ec;padding:12px 24px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;text-decoration:none;";

/** Men's items → male shoppers, women's items → female shoppers, anything else → every customer. */
async function getAudienceEmails(section: string): Promise<string[]> {
  const gender = section === "men" ? "male" : section === "women" ? "female" : null;
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(gender ? and(eq(users.role, "customer"), eq(users.gender, gender)) : eq(users.role, "customer"));
  return rows.map((r) => r.email);
}

export async function notifyNewProductAdded(product: {
  id: string;
  name: string;
  category: string;
  price: number;
  imageId: string;
  section: string;
}): Promise<void> {
  try {
    const emails = await getAudienceEmails(product.section);
    if (emails.length === 0) return;

    const html = wrapEmail(
      "New In Stock",
      `
        <img src="${unsplash(product.imageId, 480, 600)}" alt="${esc(product.name)}" style="width:100%;max-width:240px;display:block;margin:0 0 20px;object-fit:cover;" />
        <p style="margin:0 0 6px;font-size:16px;">${esc(product.name)}</p>
        <p style="margin:0 0 20px;font-size:13px;color:rgba(28,26,22,0.55);">${esc(product.category)} · ${formatPrice(product.price)}</p>
        <a href="${siteUrl(`/product/${encodeURIComponent(product.id)}`)}" style="${BUTTON_STYLE}">Shop Now</a>
      `
    );

    const { sent, failed } = await sendBulkMail(emails, `New arrival: ${product.name}`, html);
    console.log(`[notifications] New product "${product.name}" — sent ${sent}, failed ${failed}.`);
  } catch (err) {
    console.error("[notifications] Failed to notify about new product:", err);
  }
}

export async function notifyOrderPlaced(order: OrderCustomerContact): Promise<void> {
  try {
    const html = wrapEmail(
      "Order Confirmed",
      `
        <p style="margin:0 0 14px;font-size:14px;">Hi ${esc(order.customerName)},</p>
        <p style="margin:0 0 14px;font-size:14px;">
          Thanks for your order <strong>${formatOrderId(order.id)}</strong>. We're getting it ready.
        </p>
        <p style="margin:0 0 20px;font-size:14px;">Order total: <strong>${formatPrice(order.total)}</strong></p>
        <a href="${siteUrl(`/orders/${order.id}`)}" style="${BUTTON_STYLE}">View Order</a>
      `
    );
    await sendMail({ to: order.customerEmail, subject: `Order Confirmed — ${formatOrderId(order.id)}`, html });
  } catch (err) {
    console.error("[notifications] Failed to send order confirmation:", err);
  }
}

export async function notifyOrderStatusChange(order: OrderCustomerContact): Promise<void> {
  try {
    const html = wrapEmail(
      `Order ${esc(order.status)}`,
      `
        <p style="margin:0 0 14px;font-size:14px;">Hi ${esc(order.customerName)},</p>
        <p style="margin:0 0 20px;font-size:14px;">
          Your order <strong>${formatOrderId(order.id)}</strong> is now <strong>${esc(order.status)}</strong>.
        </p>
        <a href="${siteUrl(`/orders/${order.id}`)}" style="${BUTTON_STYLE}">View Order</a>
      `
    );
    await sendMail({ to: order.customerEmail, subject: `Order ${order.status} — ${formatOrderId(order.id)}`, html });
  } catch (err) {
    console.error("[notifications] Failed to send order status update:", err);
  }
}

export async function notifyPasswordResetCode(input: {
  name: string;
  email: string;
  code: string;
  expiresInMinutes: number;
}): Promise<void> {
  try {
    const html = wrapEmail(
      "Reset Your Password",
      `
        <p style="margin:0 0 14px;font-size:14px;">Hi ${esc(input.name)},</p>
        <p style="margin:0 0 14px;font-size:14px;">Use this code to reset your password:</p>
        <p style="margin:0 0 20px;font-size:30px;letter-spacing:0.3em;font-family:'Courier New',monospace;">${input.code}</p>
        <p style="margin:0;font-size:13px;color:rgba(28,26,22,0.55);">
          It expires in ${input.expiresInMinutes} minutes. If you didn't ask to reset your password,
          you can ignore this email — your password won't change.
        </p>
      `
    );
    await sendMail({ to: input.email, subject: `Your password reset code: ${input.code}`, html });
  } catch (err) {
    console.error("[notifications] Failed to send password reset code:", err);
  }
}

export async function notifyPasswordChanged(input: { name: string; email: string }): Promise<void> {
  try {
    const html = wrapEmail(
      "Your Password Was Changed",
      `
        <p style="margin:0 0 14px;font-size:14px;">Hi ${esc(input.name)},</p>
        <p style="margin:0 0 14px;font-size:14px;">
          The password for your OG BANDITS 47 account was just reset, and you've been signed out on all other devices.
        </p>
        <p style="margin:0;font-size:13px;color:rgba(28,26,22,0.55);">
          If this wasn't you, reset your password again straight away and contact us.
        </p>
      `
    );
    await sendMail({ to: input.email, subject: "Your password was changed", html });
  } catch (err) {
    console.error("[notifications] Failed to send password changed notice:", err);
  }
}
