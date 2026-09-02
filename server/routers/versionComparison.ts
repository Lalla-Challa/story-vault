import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";

/**
 * Provides a simple diff between two scene versions.
 * Returns a string diff (line-by-line) for now.
 */
export const versionComparisonRouter = router({
  compare: protectedProcedure
    .input(z.object({ versionId1: z.number(), versionId2: z.number() }))
    .query(({ ctx, input }) => {
      const { versionId1, versionId2 } = input;
      const v1 = db.getVersionById(versionId1);
      const v2 = db.getVersionById(versionId2);
      if (!v1 || !v2) throw new Error("Version not found");
      const lines1 = v1.content.split("\n");
      const lines2 = v2.content.split("\n");
      const max = Math.max(lines1.length, lines2.length);
      const diffs: string[] = [];
      for (let i = 0; i < max; i++) {
        const line1 = lines1[i] ?? "";
        const line2 = lines2[i] ?? "";
        if (line1 !== line2) {
          diffs.push(`- ${line1}`);
          diffs.push(`+ ${line2}`);
        }
      }
      return diffs.join("\n");
    }),
});