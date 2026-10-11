import type { ModelUsage } from "../../application/ports/model-usage.js";

function tokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value : null;
}

export function readUsage(
  value: Record<string, unknown>,
  fallbackModel: string,
  hasGeneratedText: boolean,
): ModelUsage {
  return {
    model: typeof value.model === "string" && value.model !== ""
      ? value.model : fallbackModel,
    inputTokens: tokenCount(value.prompt_eval_count),
    outputTokens: hasGeneratedText ? tokenCount(value.eval_count) : 0,
  };
}
