import nodemailer from "nodemailer";
import { env } from "../config.js";

// Port of ../../../lib/mail.ts. Mail failures are logged, never thrown.

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;
let warned = false;

function getTransporter() {
  if (transporter) return transporter;

  const { host, port, user, pass } = env.smtp;
  if (!user || !pass) {
    if (!warned) console.warn("[mail] SMTP_USER / SMTP_PASS not set — emails will be skipped.");
    warned = true;
    return null;
  }

  transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  return transporter;
}

export function siteUrl(path = "") {
  return `${env.siteUrl}${path}`;
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function wrapEmail(title: string, bodyHtml: string) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f4f1ec;font-family:Georgia,'Times New Roman',serif;color:#1c1a16;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:560px;background-color:#ffffff;border:1px solid rgba(28,26,22,0.1);">
            <tr>
              <td style="padding:28px 32px;border-bottom:1px solid rgba(28,26,22,0.1);">
                <span style="font-size:14px;letter-spacing:0.14em;text-transform:uppercase;color:#1c1a16;">OG BANDITS 47</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-size:20px;font-weight:400;">${title}</h1>
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid rgba(28,26,22,0.1);font-size:11px;color:rgba(28,26,22,0.45);">
                You're receiving this because you have an account with OG BANDITS 47.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

type MailInput = { to: string; subject: string; html: string };

async function sendOne({ to, subject, html }: MailInput): Promise<boolean> {
  const client = getTransporter();
  if (!client) return false;

  try {
    await client.sendMail({ from: `"OG BANDITS 47" <${env.smtp.user}>`, to, subject, html });
    return true;
  } catch (err) {
    console.error(`[mail] Failed to send to ${to}:`, err);
    return false;
  }
}

export async function sendMail(input: MailInput): Promise<void> {
  await sendOne(input);
}

/** Sends individually (not CC/BCC) so recipients aren't exposed to one another. */
export async function sendBulkMail(
  recipients: string[],
  subject: string,
  html: string
): Promise<{ sent: number; failed: number }> {
  const unique = [...new Set(recipients)];
  if (unique.length === 0) return { sent: 0, failed: 0 };

  const results = await Promise.allSettled(unique.map((to) => sendOne({ to, subject, html })));
  const sent = results.filter((r) => r.status === "fulfilled" && r.value).length;
  return { sent, failed: unique.length - sent };
}

export function isMailConfigured(): boolean {
  return Boolean(env.smtp.user && env.smtp.pass);
}
