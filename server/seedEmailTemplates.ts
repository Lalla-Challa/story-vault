import { getDb } from "./db";
import { emailTemplates } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export function seedEmailTemplates() {
  const db = getDb();
  if (!db) {
    console.error("[EmailSeeder] Database not available");
    return;
  }

  const templates = [
    {
      name: "beta_received",
      subject: "Your Story Vault Beta Request",
      body: `<div style="max-width: 600px; margin: 0 auto;">
  <h2 style="font-family: 'Literata', serif; font-size: 24px; font-weight: 600; color: #2D2926; margin: 0 0 24px 0; letter-spacing: -0.02em;">Thank you, {{name}}</h2>
  
  <p style="font-family: 'Inter', sans-serif; font-size: 15px; line-height: 1.7; color: #2D2926; margin: 0 0 20px 0;">We've received your request to join the Story Vault private beta. Your application is under review.</p>
  
  <div style="background: #F8F6F3; border-left: 3px solid #D4A373; padding: 20px; margin: 28px 0; border-radius: 2px;">
    <p style="font-family: 'Inter', sans-serif; font-size: 14px; line-height: 1.6; color: #6B705C; margin: 0 0 12px 0; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em;">What Happens Next</p>
    <ul style="font-family: 'Inter', sans-serif; font-size: 14px; line-height: 1.7; color: #2D2926; margin: 0; padding-left: 20px;">
      <li style="margin-bottom: 8px;">Review within 2–3 business days</li>
      <li style="margin-bottom: 8px;">Invitation email with credentials if approved</li>
      <li>Early access to all premium features</li>
    </ul>
  </div>
  
  <p style="font-family: 'Inter', sans-serif; font-size: 15px; line-height: 1.7; color: #2D2926; margin: 24px 0 0 0;">We'll be in touch soon.</p>
</div>`,
      variables: ["name"],
    },
    {
      name: "beta_approved",
      subject: "Welcome to Story Vault",
      body: `<div style="max-width: 600px; margin: 0 auto;">
  <h2 style="font-family: 'Literata', serif; font-size: 24px; font-weight: 600; color: #2D2926; margin: 0 0 24px 0; letter-spacing: -0.02em;">Welcome, {{name}}</h2>
  
  <p style="font-family: 'Inter', sans-serif; font-size: 15px; line-height: 1.7; color: #2D2926; margin: 0 0 28px 0;">Your beta access has been approved. You're now part of a select group shaping the future of storytelling tools.</p>
  
  <div style="background: #F8F6F3; padding: 24px; margin: 28px 0; border-radius: 2px; border: 1px solid #E5E2DE;">
    <p style="font-family: 'Inter', sans-serif; font-size: 13px; color: #6B705C; margin: 0 0 16px 0; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em;">Your Access</p>
    <table style="width: 100%; font-family: 'Inter', sans-serif; font-size: 14px; color: #2D2926;">
      <tr>
        <td style="padding: 6px 0; color: #6B705C; width: 100px;">Email</td>
        <td style="padding: 6px 0; font-weight: 500;">{{email}}</td>
      </tr>
      <tr>
        <td style="padding: 6px 0; color: #6B705C;">Tier</td>
        <td style="padding: 6px 0; font-weight: 500;">Beta Access</td>
      </tr>
      <tr>
        <td style="padding: 6px 0; color: #6B705C;">Valid Until</td>
        <td style="padding: 6px 0; font-weight: 500;">{{expiryDate}}</td>
      </tr>
    </table>
  </div>
  
  <div style="margin: 32px 0;">
    <a href="http://localhost:3000/login" style="display: inline-block; background: #D4A373; color: #FDFCFB; font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 500; padding: 12px 32px; text-decoration: none; border-radius: 2px; letter-spacing: 0.02em;">Start Writing</a>
  </div>
  
  <p style="font-family: 'Inter', sans-serif; font-size: 14px; line-height: 1.7; color: #6B705C; margin: 32px 0 0 0;">Your feedback during this beta phase will directly influence Story Vault's development. Thank you for being here.</p>
</div>`,
      variables: ["name", "email", "expiryDate"],
    },
    {
      name: "beta_denied",
      subject: "Your Story Vault Beta Request",
      body: `<div style="max-width: 600px; margin: 0 auto;">
  <h2 style="font-family: 'Literata', serif; font-size: 24px; font-weight: 600; color: #2D2926; margin: 0 0 24px 0; letter-spacing: -0.02em;">Thank you, {{name}}</h2>
  
  <p style="font-family: 'Inter', sans-serif; font-size: 15px; line-height: 1.7; color: #2D2926; margin: 0 0 20px 0;">We've carefully reviewed your beta request. Unfortunately, we're unable to offer access at this time. {{reason}}</p>
  
  <div style="background: #F8F6F3; border-left: 3px solid #6B705C; padding: 20px; margin: 28px 0; border-radius: 2px;">
    <p style="font-family: 'Inter', sans-serif; font-size: 14px; line-height: 1.6; color: #6B705C; margin: 0 0 12px 0; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em;">What's Next</p>
    <ul style="font-family: 'Inter', sans-serif; font-size: 14px; line-height: 1.7; color: #2D2926; margin: 0; padding-left: 20px;">
      <li style="margin-bottom: 8px;">We'll notify you when Story Vault launches publicly</li>
      <li style="margin-bottom: 8px;">You're welcome to reapply for future beta waves</li>
      <li>Follow our updates for announcements</li>
    </ul>
  </div>
  
  <p style="font-family: 'Inter', sans-serif; font-size: 15px; line-height: 1.7; color: #2D2926; margin: 24px 0 0 0;">Thank you for your interest in Story Vault.</p>
</div>`,
      variables: ["name", "reason"],
    },
  ];

  for (const template of templates) {
    try {
      const existing = db
        .select()
        .from(emailTemplates)
        .where(eq(emailTemplates.name, template.name))
        .get();
      if (existing) {
        db.update(emailTemplates)
          .set({ subject: template.subject, body: template.body, variables: template.variables })
          .where(eq(emailTemplates.name, template.name))
          .run();
        console.log(`[EmailSeeder] Updated template: ${template.name}`);
      } else {
        db.insert(emailTemplates).values(template).run();
        console.log(`[EmailSeeder] Created template: ${template.name}`);
      }
    } catch (error) {
      console.error(`[EmailSeeder] Error seeding template ${template.name}:`, error);
    }
  }
  console.log("[EmailSeeder] Email templates seeded successfully");
}