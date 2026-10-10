import { cosineSimilarity } from "../domain/cosine-similarity.js";
import type { DocumentIndex } from "../domain/document-index.js";
import type { EmbeddingGenerator } from "./ports/embedding-generator.js";
import type { IndexReader } from "./ports/index-reader.js";

export interface SearchResult {
  source: string;
  chunkIndex: number;
  text: string;
  score: number;
}

export const DEFAULT_MIN_SCORE = 0.3;

interface SearchDependencies {
  indexReader: IndexReader;
  createEmbeddingGenerator: (model: string) => EmbeddingGenerator;
}

export async function searchDocuments(
  question: string,
  dependencies: SearchDependencies,
  limit: number = 3,
  minScore: number = DEFAULT_MIN_SCORE,
): Promise<SearchResult[]> {
  const { results } = await searchDocumentsWithIndexes(question, dependencies, limit, minScore);
  return results;
}

export async function searchDocumentsWithIndexes(
  question: string,
  dependencies: SearchDependencies,
  limit: number = 3,
  minScore: number = DEFAULT_MIN_SCORE,
): Promise<{ results: SearchResult[]; indexes: DocumentIndex[] }> {
  const trimmedQuestion = question.trim();

  if (trimmedQuestion === "") {
    throw new Error("The question cannot be empty.");
  }

  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error("The result limit must be a positive integer.");
  }

  if (!Number.isFinite(minScore) || minScore < -1 || minScore > 1) {
    throw new Error("The similarity threshold must be a number between -1 and 1.");
  }

  const indexes = await dependencies.indexReader.loadAll();

  if (indexes.length === 0) {
    throw new Error("No JSON indexes were found to search.");
  }

  const referenceIndex = indexes[0];

  for (const index of indexes) {
    if (
      index.embeddingModel !== referenceIndex.embeddingModel ||
      index.dimensions !== referenceIndex.dimensions
    ) {
      throw new Error(
        `Incompatible index: ${index.source} uses ${index.embeddingModel} with ${index.dimensions} dimensions; expected ${referenceIndex.embeddingModel} with ${referenceIndex.dimensions}. Reindex the documents with the same model.`,
      );
    }
  }

  const embeddingGenerator = dependencies.createEmbeddingGenerator(
    referenceIndex.embeddingModel,
  );

  const questionEmbedding = await embeddingGenerator.generate(trimmedQuestion);

  if (questionEmbedding.length !== referenceIndex.dimensions) {
    throw new Error(
      "The question embedding dimensions do not match the index.",
    );
  }

  const results: SearchResult[] = indexes.flatMap(documentIndex =>
    documentIndex.chunks.map(chunk => ({
      source: documentIndex.source,
      chunkIndex: chunk.index,
      text: chunk.text,
      score: cosineSimilarity(questionEmbedding, chunk.embedding),
    })),
  );

  results.sort((a, b) => b.score - a.score);

  return {
    results: results.filter(result => result.score >= minScore).slice(0, limit),
    indexes,
  };
}
