import { cosineSimilarity } from "../domain/cosine-similarity.js";
import type { EmbeddingGenerator } from "./ports/embedding-generator.js";
import type { IndexReader } from "./ports/index-reader.js";

export interface SearchResult {
  source: string;
  chunkIndex: number;
  text: string;
  score: number;
}

interface SearchDependencies {
  indexReader: IndexReader;
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

  const indexes = await dependencies.indexReader.loadAll();

  if (indexes.length === 0) {
    throw new Error("No se encontraron índices JSON para buscar.");
  }

  const referenceIndex = indexes[0];

  for (const index of indexes) {
    if (
      index.embeddingModel !== referenceIndex.embeddingModel ||
      index.dimensions !== referenceIndex.dimensions
    ) {
      throw new Error(
        `Índice incompatible: ${index.source} usa ${index.embeddingModel} con ${index.dimensions} dimensiones; se esperaba ${referenceIndex.embeddingModel} con ${referenceIndex.dimensions}. Reindexá los documentos con el mismo modelo.`,
      );
    }
  }

  const embeddingGenerator = dependencies.createEmbeddingGenerator(
    referenceIndex.embeddingModel,
  );

  const questionEmbedding = await embeddingGenerator.generate(trimmedQuestion);

  if (questionEmbedding.length !== referenceIndex.dimensions) {
    throw new Error(
      "La dimensión del embedding de la pregunta no coincide con la del índice.",
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

  return results.slice(0, limit);
}
