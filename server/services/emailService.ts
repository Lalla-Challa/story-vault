import { getDb } from "../db";
import { emailTemplates, emailLogs } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import nodemailer from "nodemailer";

/**
 * Local-first email service. SMTP settings are read from env; without them
 * emails are logged as failed but never block the caller (local app).
 */
function createTransporter() {
  const host = process.env.EMAIL_HOST ?? "smtp.gmail.com";
  const port = parseInt(process.env.EMAIL_PORT ?? "587", 10);
  const user = process.env.EMAIL_USER ?? "";
  const pass = process.env.EMAIL_PASS ?? "";
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: false,
    auth: { user, pass },
  });
}

export function getTemplates() {
  const db = getDb();
  if (!db) return [];
  return db.select().from(emailTemplates).all();
}

export function createTemplate(data: { name: string; subject: string; body: string; variables: any }) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  db.insert(emailTemplates).values(data).run();
}

/**
 * Sends an email using the configured SMTP account. Never throws on
 * transport failure — the attempt is recorded in email_logs.
 */
export function sendEmail(
  recipientEmail: string,
  templateName: string,
  variables: Record<string, string>
): boolean {
  const db = getDb();
  if (!db) return false;

  const template = db
    .select()
    .from(emailTemplates)
    .where(eq(emailTemplates.name, templateName))
    .get();
  if (!template) {
    console.warn(`[EmailService] Template ${templateName} not found`);
    return false;
  }

  let subject = template.subject;
  let body = template.body;
  for (const [key, value] of Object.entries(variables)) {
    subject = subject.replace(new RegExp(`{{${key}}}`, "g"), value);
    body = body.replace(new RegExp(`{{${key}}}`, "g"), value);
  }

  const result = db
    .insert(emailLogs)
    .values({ recipientEmail, templateId: template.id, status: "pending" })
    .run();
  const logId = result.lastInsertRowid as number;

  const transporter = createTransporter();
  if (!transporter) {
    db.update(emailLogs)
      .set({ status: "failed", error: "SMTP not configured" })
      .where(eq(emailLogs.id, logId))
      .run();
    return false;
  }

  try {
    const htmlBody = `
      <div style="font-family: 'Literata', serif; background-color: #FDFCFB; padding: 40px; color: #2D2926; line-height: 1.6; border: 1px solid #E5E2DE; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 40px;">
          <h1 style="font-size: 28px; letter-spacing: -0.02em; border-bottom: 2px solid #D4A373; display: inline-block; padding-bottom: 8px;">Story Vault</h1>
        </div>
        <div style="background: white; padding: 32px; border-radius: 4px; box-shadow: 0 4px 12px rgba(45,41,38,0.03);">
          ${body.replace(/\n/g, "<br/>")}
        </div>
        <div style="text-align: center; margin-top: 40px; font-size: 12px; color: #6B705C;">
          <p>© 2026 Story Vault — The Professional Workspace for Modern Storytellers</p>
        </div>
      </div>
    `;

    transporter.sendMail({
      from: process.env.EMAIL_FROM ?? `"Story Vault" <${process.env.EMAIL_USER ?? "storyvault"}>`,
      to: recipientEmail,
      subject,
      html: htmlBody,
    });

    db.update(emailLogs).set({ status: "sent" }).where(eq(emailLogs.id, logId)).run();
    return true;
  } catch (error: any) {
    console.error("[EmailService] Error:", error);
    db.update(emailLogs)
      .set({ status: "failed", error: error.message })
      .where(eq(emailLogs.id, logId))
      .run();
    return false;
  }
}