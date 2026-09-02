/**
 * Context budgeting for the agent.
 *
 * The naive approach — dump every project-memory entry and every chat message
 * into the prompt — breaks once a conversation outgrows the model's context
 * window. This module estimates token usage before a request is sent and
 * computes how much of the window is available for conversation history, so
 * the caller can keep only what fits (see runAgent.ts).
 *
 * Estimation is deliberately conservative (heuristic, not a real tokenizer):
 * we over-estimate slightly rather than risk blowing the window.
 */

/** Default assumed context window when the model name is unknown. */
export const DEFAULT_CONTEXT_WINDOW = 128_000;

/**
 * Fraction of the context window reserved for the model's response plus tool
 * definitions / tool results interleaved by the SDK. The rest is available
 * for our input (system prompt + memory + conversation).
 */
export const INPUT_BUDGET_RATIO = 0.75;

/**
 * Rough token estimation: ~4 chars/token for Latin text, ~1.3 chars/token
 * for CJK (Chinese/Japanese/Korean), ~0.5 chars/token for code-heavy blocks.
 * We use a blended 3.5 chars/token average, which over-estimates pure English
 * (safe) and under-estimates nothing by more than a small margin.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (
      (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
      (code >= 0x3040 && code <= 0x30ff) || // Hiragana / Katakana
      (code >= 0xac00 && code <= 0xd7af) // Hangul Syllables
    ) {
      cjk++;
    }
  }
  const latin = text.length - cjk;
  return Math.ceil(latin / 4 + cjk * 1.4);
}

/** Total estimated tokens for a list of strings (e.g. a memory block). */
export function estimateTokensOf(items: string[]): number {
  return items.reduce((sum, s) => sum + estimateTokens(s), 0);
}

/**
 * Heuristic model → context window detection. Model names are matched
 * case-insensitively against known patterns; unknown models fall back to
 * `DEFAULT_CONTEXT_WINDOW` unless the user configured an explicit window.
 */
export function detectContextWindow(model: string): number {
  const m = model.toLowerCase();

  // Anthropic (current generation supports up to 1M on opus 4.x, 200k std.)
  if (m.includes("claude")) {
    if (m.includes("opus")) return 1_000_000;
    if (m.includes("haiku")) return 200_000;
    return 200_000;
  }

  // OpenAI
  if (m.includes("gpt-5")) return 400_000;
  if (m.includes("gpt-4")) {
    if (m.includes("32k")) return 32_768;
    if (m.includes("turbo")) return 128_000;
    if (m.includes("o")) return 128_000;
    return 8_192;
  }
  if (m.includes("gpt-3.5")) return 16_385;
  if (m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4")) return 200_000;

  // Google
  if (m.includes("gemini")) {
    if (m.includes("flash")) return 1_048_576;
    return 1_048_576;
  }

  // Open-source / aggregator families
  if (m.includes("llama-3.1") || m.includes("llama-3.2") || m.includes("llama-3.3")) {
    return 131_072;
  }
  if (m.includes("llama") || m.includes("llama3")) return 8_192;
  if (m.includes("mistral-large")) return 128_000;
  if (m.includes("mistral")) return 32_768;
  if (m.includes("deepseek")) return 131_072;
  if (m.includes("qwen2.5")) return 131_072;
  if (m.includes("qwen")) return 32_768;
  if (m.includes("glm") || m.includes("chatglm")) return 128_000;
  if (m.includes("mimo") || m.includes("minimax")) return 128_000;

  return DEFAULT_CONTEXT_WINDOW;
}

/**
 * Resolves the effective context window for a run: an explicit user-configured
 * window wins; otherwise the model name is matched against known families.
 */
export function resolveContextWindow(model: string, configured?: number | null): number {
  if (configured && configured > 0) return configured;
  return detectContextWindow(model);
}

export type ContextBudget = {
  /** Total model context window in tokens. */
  contextWindow: number;
  /** Tokens available for our input (system + memory + conversation). */
  inputBudget: number;
  /** Tokens reserved for the response + tool I/O. */
  responseReserve: number;
};

/**
 * Computes how many tokens we may spend on the input portion of the prompt.
 */
export function computeBudget(
  contextWindow: number,
  responseReserveOverride?: number
): ContextBudget {
  const responseReserve =
    responseReserveOverride ??
    Math.ceil(contextWindow * (1 - INPUT_BUDGET_RATIO));
  const inputBudget = Math.max(1, contextWindow - responseReserve);
  return { contextWindow, inputBudget, responseReserve };
}
