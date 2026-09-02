/**
 * Lightweight line-diff for proposal review.
 * Produces rows suitable for a two-column (original | proposed) view.
 */

export type DiffRow = {
  /** Line from the original content, or null when this is an added line. */
  a: string | null;
  /** Line from the proposed content, or null when this is a removed line. */
  b: string | null;
};

const MAX_LCS_CELLS = 1_500_000;

/**
 * Computes a line diff between two texts. Uses a classic LCS when the inputs
 * are small enough, and a fast prefix/suffix trim (middle shown as changed)
 * for very long documents.
 */
export function diffLines(aText: string, bText: string): DiffRow[] {
  const a = aText.split("\n");
  const b = bText.split("\n");

  // Fast path: identical
  if (a.length === b.length && a.every((l, i) => l === b[i])) {
    return a.map((line) => ({ a: line, b: line }));
  }

  // Fast path: big inputs → trim common prefix/suffix, mark the rest changed
  if (a.length * b.length > MAX_LCS_CELLS) {
    return fastDiff(a, b);
  }

  return lcsDiff(a, b);
}

function lcsDiff(a: string[], b: string[]): DiffRow[] {
  const n = a.length;
  const m = b.length;
  // dp[i][j] = LCS length of a[0..i) and b[0..j)
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const rows: DiffRow[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      rows.unshift({ a: a[i - 1], b: b[j - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rows.unshift({ a: null, b: b[j - 1] });
      j--;
    } else {
      rows.unshift({ a: a[i - 1], b: null });
      i--;
    }
  }
  return rows;
}

function fastDiff(a: string[], b: string[]): DiffRow[] {
  let start = 0;
  const maxStart = Math.min(a.length, b.length);
  while (start < maxStart && a[start] === b[start]) start++;

  let endA = a.length;
  let endB = b.length;
  const maxEnd = Math.min(a.length - start, b.length - start);
  let suffix = 0;
  while (suffix < maxEnd && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
  endA = a.length - suffix;
  endB = b.length - suffix;

  const rows: DiffRow[] = [];
  for (let k = 0; k < start; k++) rows.push({ a: a[k], b: b[k] });

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const maxMid = Math.max(midA.length, midB.length);
  for (let k = 0; k < maxMid; k++) {
    rows.push({ a: midA[k] ?? null, b: midB[k] ?? null });
  }

  for (let k = suffix - 1; k >= 0; k--) {
    rows.push({ a: a[a.length - 1 - k], b: b[b.length - 1 - k] });
  }
  return rows;
}

/** Strips HTML to plain text for diff readability (mirrors server logic). */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}