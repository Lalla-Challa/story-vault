import { z } from "zod";
import { publicProcedure, router } from "./trpc";
import { isConfigured, isUnlocked } from "./localAuth";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  /** Reports whether the local vault is configured and unlocked. */
  vaultState: publicProcedure.query(() => ({
    configured: isConfigured(),
    unlocked: isUnlocked(),
  })),
});