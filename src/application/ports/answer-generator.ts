export interface AnswerFragment {
  source: string;
  chunkIndex: number;
  text: string;
}

export interface AnswerGenerator {
  generate(
    question: string,
    fragments: AnswerFragment[],
  ): Promise<string>;
}