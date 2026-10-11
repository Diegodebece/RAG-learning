export interface AnswerFragment {
  source: string;
  chunkIndex: number;
  text: string;
}

export interface AnswerGenerator {
  generate(
    question: string,
    fragments: AnswerFragment[],
    onUsage?: UsageListener,
    onText?: (text: string) => void,
  ): Promise<string>;
}
import type { UsageListener } from "./model-usage.js";
