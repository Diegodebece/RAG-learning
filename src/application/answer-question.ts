import type { AnswerGenerator } from "./ports/answer-generator.js";
import type { EmbeddingGenerator } from "./ports/embedding-generator.js";
import type { IndexRepository } from "./ports/index-repository.js";
import { searchDocuments } from "./search-documents.js";
import type { SearchResult } from "./search-documents.js";

export interface AnswerSource extends SearchResult {
  id: string;
}

export interface AnswerResult {
  answer: string;
  sources: AnswerSource[];
}

interface AnswerDependencies {
  repository: IndexRepository;
  createEmbeddingGenerator: (model: string) => EmbeddingGenerator;
  answerGenerator: AnswerGenerator;
}

export async function answerQuestion(
  question: string,
  dependencies: AnswerDependencies,
  limit: number = 3,
): Promise<AnswerResult> {
  const results = await searchDocuments(
    question,
    {
      repository: dependencies.repository,
      createEmbeddingGenerator: dependencies.createEmbeddingGenerator,
    },
    limit,
  );

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