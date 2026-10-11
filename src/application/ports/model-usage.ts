export interface ModelUsage {
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

export type UsageListener = (usage: ModelUsage) => void;
