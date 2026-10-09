import type { AnswerGenerator } from "./ports/answer-generator.js";
import type { EmbeddingGenerator } from "./ports/embedding-generator.js";
import type { IndexReader } from "./ports/index-reader.js";
import { DEFAULT_MIN_SCORE, searchDocuments } from "./search-documents.js";
import type { SearchResult } from "./search-documents.js";

export interface AnswerSource extends SearchResult {
  id: string;
}

export interface AnswerResult {
  answer: string;
  sources: AnswerSource[];
}

interface AnswerDependencies {
  indexReader: IndexReader;
  createEmbeddingGenerator: (model: string) => EmbeddingGenerator;
  answerGenerator: AnswerGenerator;
}

export async function answerQuestion(
  question: string,
  dependencies: AnswerDependencies,
  limit: number = 3,
  minScore: number = DEFAULT_MIN_SCORE,
): Promise<AnswerResult> {
  const results = await searchDocuments(
    question,
    {
      indexReader: dependencies.indexReader,
      createEmbeddingGenerator: dependencies.createEmbeddingGenerator,
    },
    limit,
    minScore,
  );

  if (results.length === 0) {
    return {
      answer: "No encontré fragmentos suficientemente relacionados con la pregunta en los documentos indexados.",
      sources: [],
    };
  }

  const answer = await dependencies.answerGenerator.generate(
    question.trim(),
    results,
  );

  const sources: AnswerSource[] = results.map((result, position) => ({
    ...result,
    id: `F${position + 1}`,
  }));

  return { answer, sources };
}
