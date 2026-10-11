import type { ModelUsage } from "./ports/model-usage.js";

export type UsageStage = "document-embedding" | "query-embedding" | "answer";

export interface TokenTotals {
  inputTokens: number | null;
  outputTokens: number | null;
}

export type ProgressEvent =
  | { type: "answer-text"; text: string }
  | {
      type: "usage";
      stage: UsageStage;
      usage: ModelUsage;
      cumulative: TokenTotals;
      completed?: number;
      total?: number;
    };

export type ProgressListener = (event: ProgressEvent) => void;

export class UsageTracker {
  private inputTokens: number | null = 0;
  private outputTokens: number | null = 0;

  constructor(private readonly onProgress?: ProgressListener) {}

  record(stage: UsageStage, usage: ModelUsage, progress?: { completed: number; total: number }): void {
    this.inputTokens = this.inputTokens === null || usage.inputTokens === null
      ? null : this.inputTokens + usage.inputTokens;
    this.outputTokens = this.outputTokens === null || usage.outputTokens === null
      ? null : this.outputTokens + usage.outputTokens;

    this.onProgress?.({
      type: "usage",
      stage,
      usage,
      cumulative: { inputTokens: this.inputTokens, outputTokens: this.outputTokens },
      ...progress,
    });
  }

  answerText(text: string): void {
    this.onProgress?.({ type: "answer-text", text });
  }
}
