import type { UsageListener } from "./model-usage.js";

export interface EmbeddingGenerator {
  generate(text: string, onUsage?: UsageListener): Promise<number[]>;
}
