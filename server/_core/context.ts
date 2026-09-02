import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { isUnlocked } from "../_core/localAuth";
import { getLocalUser } from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  if (isUnlocked()) {
    try {
      user = getLocalUser();
    } catch {
      // If the DB is unavailable, serve requests as unauthenticated.
    }
  }

  if (user) {
    (opts.req as any).userId = user.id;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}