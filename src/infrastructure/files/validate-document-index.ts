import type { DocumentIndex } from "../../domain/document-index.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function validateDocumentIndex(value: unknown): asserts value is DocumentIndex {
  if (!isRecord(value) || value.version !== 1) {
    throw new Error("The index must use format version 1.");
  }

  if (
    typeof value.source !== "string" || value.source.trim() === "" ||
    typeof value.embeddingModel !== "string" || value.embeddingModel.trim() === "" ||
    !isPositiveInteger(value.dimensions)
  ) {
    throw new Error("The index must specify a source, model, and positive integer dimension.");
  }

  const chunking = value.chunking;

  if (
    !isRecord(chunking) ||
    !isPositiveInteger(chunking.maxChars) ||
    typeof chunking.overlapChars !== "number" ||
    !Number.isSafeInteger(chunking.overlapChars) ||
    chunking.overlapChars < 0 || chunking.overlapChars >= chunking.maxChars
  ) {
    throw new Error("The index chunking configuration is invalid.");
  }

  if (!Array.isArray(value.chunks) || value.chunks.length === 0) {
    throw new Error("The index must contain at least one chunk.");
  }

  for (const [position, chunk] of value.chunks.entries()) {
    if (
      !isRecord(chunk) || chunk.index !== position ||
      typeof chunk.text !== "string" || chunk.text.trim() === "" ||
      chunk.text.length > chunking.maxChars ||
      !Array.isArray(chunk.embedding) || chunk.embedding.length !== value.dimensions ||
      !chunk.embedding.every((item: unknown) => typeof item === "number" && Number.isFinite(item))
    ) {
      throw new Error(`Chunk ${position + 1} in the index has invalid data or dimensions.`);
    }
  }
}
