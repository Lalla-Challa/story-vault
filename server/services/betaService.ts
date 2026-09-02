import { getDb } from "../db";
import { users, betaRequests } from "../../drizzle/schema";
import { eq, desc, like } from "drizzle-orm";
import { sendEmail } from "./emailService";
import { TRPCError } from "@trpc/server";
import { randomBytes, scryptSync } from "crypto";
import { logAdminAction } from "./auditService";

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

/**
 * Provisions a beta tester account. Retained for the admin UI — in the
 * local-first app this mostly affects the local database (emails will not
 * send without SMTP configuration).
 */
export function provisionTester(
  adminId: number,
  name: string,
  contactEmail: string,
  daysToExpiry: number = 30
): { email: string; password: string } {
  const db = getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

  const lastTester = db
    .select({ email: users.email })
    .from(users)
    .where(like(users.email, "tester%@storyvault.com"))
    .orderBy(desc(users.email))
    .limit(1)
    .get();

  let nextNumber = 1;
  if (lastTester?.email) {
    const match = lastTester.email.match(/tester(\d+)@/);
    if (match) nextNumber = parseInt(match[1], 10) + 1;
  }
  const generatedEmail = `tester${nextNumber.toString().padStart(3, "0")}@storyvault.com`;

  const password = Math.random().toString(36).slice(-10);
  const passwordHash = hashPassword(password);
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + daysToExpiry);

  const openId = `email:${generatedEmail}`;

  db.insert(users)
    .values({
      openId,
      name,
      email: generatedEmail,
      contactEmail: contactEmail.toLowerCase().trim(),
      loginMethod: "email",
      passwordHash,
      role: "user",
      betaTier: "beta",
      betaExpiry: expiryDate,
      forcePasswordChange: true,
    })
    .onConflictDoUpdate({
      target: users.openId,
      set: {
        passwordHash,
        betaTier: "beta",
        betaExpiry: expiryDate,
        forcePasswordChange: true,
      },
    })
    .run();

  const targetUser = db.select().from(users).where(eq(users.email, generatedEmail)).get();
  if (!targetUser) throw new TRPCError({ code: "NOT_FOUND" });

  db.update(betaRequests)
    .set({ status: "invited" })
    .where(eq(betaRequests.email, contactEmail.toLowerCase().trim()))
    .run();

  sendEmail(contactEmail, "beta_invitation", {
    name,
    email: generatedEmail,
    password,
    expiry: expiryDate.toLocaleDateString(),
    login_url: "http://localhost:3000/login",
  });

  logAdminAction(adminId, "provision_beta_account", "user", targetUser.id, {
    contactEmail,
    generatedEmail,
    betaTier: "beta",
  });

  return { email: generatedEmail, password };
}