import type { LanguageModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { AgentSettings } from "./settings";

export const OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434/v1";

/**
 * Normalizes a user-entered base URL so the AI SDK can append its own path.
 *
 * The OpenAI-compatible provider appends `/chat/completions` to the base URL.
 * Users often paste the *full* endpoint (e.g.
 * `https://opencode.ai/zen/v1/chat/completions`), which would otherwise
 * produce `…/chat/completions/chat/completions` → 404. We strip that suffix
 * (and any trailing slashes) so both forms work.
 */
export function normalizeBaseUrl(baseUrl: string): string {
  let url = baseUrl.trim().replace(/\/+$/, "");
  // Strip a trailing /chat/completions (even with a query string) — the SDK appends it.
  url = url.replace(/\/chat\/completions(?=\?|$)/i, "");
  return url;
}

/**
 * Builds an AI SDK `LanguageModel` from the stored agent settings.
 * Supports OpenAI, Anthropic, and any OpenAI-compatible endpoint.
 *
 * Third-party gateways (Ollama, LM Studio, aggregators like opencode.ai…)
 * must use the dedicated `@ai-sdk/openai-compatible` provider
 * (`createOpenAICompatible`) rather than the OpenAI one.
 */
export function buildModel(settings: AgentSettings): LanguageModel {
  if (!settings.model.trim()) {
    throw new Error("No model configured. Set a model name in AI settings.");
  }

  const baseUrl = settings.baseUrl ? normalizeBaseUrl(settings.baseUrl) : "";

  switch (settings.provider) {
    case "anthropic": {
      if (!settings.apiKey) throw new Error("Anthropic API key is not configured.");
      return createAnthropic({
        apiKey: settings.apiKey,
        baseURL: baseUrl || undefined,
      }).languageModel(settings.model as never);
    }
    case "openai-compatible": {
      // OpenAI-compatible endpoints (Ollama, LM Studio, aggregators…) — may not require a key.
      return createOpenAICompatible({
        name: "openai-compatible",
        apiKey: settings.apiKey || "not-needed",
        baseURL: baseUrl || OLLAMA_DEFAULT_BASE_URL,
      }).languageModel(settings.model as never);
    }
    case "openai":
    default: {
      if (!settings.apiKey) throw new Error("OpenAI API key is not configured.");
      return createOpenAI({
        apiKey: settings.apiKey,
        baseURL: baseUrl || undefined,
      }).languageModel(settings.model as never);
    }
  }
}