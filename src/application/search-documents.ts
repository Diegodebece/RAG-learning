import { cosineSimilarity } from "../domain/cosine-similarity.js";
import type { EmbeddingGenerator } from "./ports/embedding-generator.js";
import type { IndexRepository } from "./ports/index-repository.js";

export interface SearchResult {
  source: string;
  chunkIndex: number;
  text: string;
  score: number;
}

interface SearchDependencies {
  repository: IndexRepository;
  createEmbeddingGenerator: (model: string) => EmbeddingGenerator;
}

export async function searchDocuments(
  question: string,
  dependencies: SearchDependencies,
  limit: number = 3,
): Promise<SearchResult[]> {
  const trimmedQuestion = question.trim();

  if (trimmedQuestion === "") {
    throw new Error("La pregunta no puede estar vacía.");
  }

  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error("El límite de resultados debe ser un entero positivo.");
  }

  const documentIndex = await dependencies.repository.load();

  const embeddingGenerator = dependencies.createEmbeddingGenerator(
    documentIndex.embeddingModel,
  );

  const questionEmbedding = await embeddingGenerator.generate(trimmedQuestion);

  if (questionEmbedding.length !== documentIndex.dimensions) {
    throw new Error(
      "La dimensión del embedding de la pregunta no coincide con la del índice.",
    );
  }

  const results: SearchResult[] = documentIndex.chunks.map((chunk) => ({
    source: documentIndex.source,
    chunkIndex: chunk.index,
    text: chunk.text,
    score: cosineSimilarity(questionEmbedding, chunk.embedding),
  }));

  results.sort((a, b) => b.score - a.score);

  return results.slice(0, limit);
}