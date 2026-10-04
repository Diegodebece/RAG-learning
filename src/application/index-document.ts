import { chunkText } from "../domain/chunk-text.js";
import type { DocumentIndex, IndexedChunk } from "../domain/document-index.js";
import type { EmbeddingGenerator } from "./ports/embedding-generator.js";
import type { IndexRepository } from "./ports/index-repository.js";

interface IndexDocumentInput {
  source: string;
  text: string;
  embeddingModel: string;
  maxChars?: number;
}

interface IndexDependencies {
  repository: IndexRepository;
  createEmbeddingGenerator: (model: string) => EmbeddingGenerator;
}

export async function indexDocument(
  input: IndexDocumentInput,
  dependencies: IndexDependencies,
): Promise<DocumentIndex | null> {
  const { source, text, embeddingModel, maxChars = 500 } = input;

  if (source.trim() === "" || embeddingModel.trim() === "") {
    throw new Error("El origen y el modelo de embeddings no pueden estar vacíos.");
  }

  const chunks = chunkText(text, maxChars);

  if (chunks.length === 0) {
    return null;
  }

  const embeddingGenerator = dependencies.createEmbeddingGenerator(embeddingModel);
  const indexedChunks: IndexedChunk[] = [];
  let expectedDimensions: number | undefined;

  for (const [index, chunk] of chunks.entries()) {
    const embedding = await embeddingGenerator.generate(chunk);

    if (embedding.length === 0 || !embedding.every(Number.isFinite)) {
      throw new Error(`El fragmento ${index + 1} recibió un embedding vacío o con números no finitos.`);
    }

    if (expectedDimensions !== undefined && embedding.length !== expectedDimensions) {
      throw new Error(
        `El fragmento ${index + 1} tiene un embedding de ${embedding.length} dimensiones; se esperaban ${expectedDimensions}.`,
      );
    }

    expectedDimensions = embedding.length;
    indexedChunks.push({ index, text: chunk, embedding });
  }

  const documentIndex: DocumentIndex = {
    version: 1,
    source,
    embeddingModel,
    dimensions: indexedChunks[0].embedding.length,
    chunking: { maxChars, overlapChars: 0 },
    chunks: indexedChunks,
  };

  // Guardamos una sola vez, después de generar y validar todos los vectores.
  await dependencies.repository.save(documentIndex);
  return documentIndex;
}
