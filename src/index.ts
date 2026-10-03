import { join, parse } from "node:path";
import type { EmbeddingGenerator } from "./application/ports/embedding-generator.js";
import type { IndexRepository } from "./application/ports/index-repository.js";
import { chunkText } from "./domain/chunk-text.js";
import type { DocumentIndex, IndexedChunk } from "./domain/document-index.js";
import { readTextFile } from "./infrastructure/files/read-text-file.js";
import { JsonIndexRepository } from "./infrastructure/files/json-index-repository.js";
import { OllamaEmbeddingGenerator } from "./infrastructure/ollama/ollama-embedding-generator.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const filePath = args[0];

  if (args.length !== 1 || !filePath) {
    console.error("Uso: npm start -- <ruta-al-archivo.txt>");
    process.exitCode = 1;
    return;
  }

  try {
    const maxChars = 500;
    const embeddingModel = "qwen3-embedding:0.6b";
    const content = await readTextFile(filePath);
    const chunks = chunkText(content, maxChars);

    if (chunks.length === 0) {
      console.log("El archivo está vacío o solo contiene espacios.");
      return;
    }

    console.log(`Fragmentos generados: ${chunks.length}`);

    const embeddingGenerator: EmbeddingGenerator = new OllamaEmbeddingGenerator(embeddingModel);
    const indexedChunks: IndexedChunk[] = [];
    let expectedDimensions: number | undefined;

    for (const [index, chunk] of chunks.entries()) {
      console.log(`\nFragmento ${index + 1} (${chunk.length} caracteres):`);
      console.log(chunk);
      console.log("Generando embedding...");

      const embedding = await embeddingGenerator.generate(chunk);

      if (expectedDimensions !== undefined && embedding.length !== expectedDimensions) {
        throw new Error(
          `El fragmento ${index + 1} tiene un embedding de ${embedding.length} dimensiones; se esperaban ${expectedDimensions}.`,
        );
      }

      expectedDimensions = embedding.length;
      indexedChunks.push({ index, text: chunk, embedding });
      console.log(`Embedding válido: ${embedding.length} dimensiones.`);
    }

    const documentIndex: DocumentIndex = {
      version: 1,
      source: filePath,
      embeddingModel,
      dimensions: indexedChunks[0].embedding.length,
      chunking: { maxChars, overlapChars: 0 },
      chunks: indexedChunks,
    };

    console.log(`\nÍndice en memoria: ${documentIndex.chunks.length} fragmentos con sus embeddings.`);
    console.log(`Origen: ${documentIndex.source}`);
    console.log(`Modelo: ${documentIndex.embeddingModel}`);
    console.log(`Dimensiones: ${documentIndex.dimensions}`);

    const indexPath = join("data", `${parse(filePath).name}.json`);
    const repository: IndexRepository = new JsonIndexRepository(indexPath);

    await repository.save(documentIndex);
    console.log(`Índice guardado en: ${indexPath}`);

    const savedIndex = await repository.load();
    console.log(
      `Índice recuperado del JSON: ${savedIndex.chunks.length} fragmentos de ${savedIndex.dimensions} dimensiones.`,
    );
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      console.error(`No se encontró el archivo: ${filePath}`);
    } else {
      const detail = error instanceof Error ? error.message : "Error desconocido";
      console.error(`No se pudo procesar el archivo: ${detail}`);
    }

    process.exitCode = 1;
  }
}

await main();
