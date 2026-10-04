import { join, parse } from "node:path";
import type { EmbeddingGenerator } from "./application/ports/embedding-generator.js";
import type { IndexRepository } from "./application/ports/index-repository.js";
import { chunkText } from "./domain/chunk-text.js";
import type { DocumentIndex, IndexedChunk } from "./domain/document-index.js";
import { readTextFile } from "./infrastructure/files/read-text-file.js";
import { JsonIndexRepository } from "./infrastructure/files/json-index-repository.js";
import { OllamaEmbeddingGenerator } from "./infrastructure/ollama/ollama-embedding-generator.js";
import { searchDocuments } from "./application/search-documents.js";
import { answerQuestion } from "./application/answer-question.js";
import { OllamaAnswerGenerator } from "./infrastructure/ollama/ollama-answer-generator.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const [command, filePath, question] = args;

  const isIndexCommand = command === "index" && args.length === 2;
  const isSearchCommand = command === "search" && args.length === 3;
  const isAskCommand = command === "ask" && args.length === 3;

  if (!filePath || (!isIndexCommand && !isSearchCommand && !isAskCommand)) {
    console.error("Uso:");
    console.error("  npm start -- index <ruta-al-archivo.txt>");
    console.error('  npm start -- search <ruta-al-indice.json> "<pregunta>"');
    console.error('  npm start -- ask <ruta-al-indice.json> "<pregunta>"');
    process.exitCode = 1;
    return;
  }
  try {
    if (command === "ask") {
      const repository: IndexRepository =
        new JsonIndexRepository(filePath);

      console.log("Buscando fragmentos y generando respuesta...");

      const result = await answerQuestion(question, {
        repository,
        createEmbeddingGenerator: (model) =>
          new OllamaEmbeddingGenerator(model),
        answerGenerator: new OllamaAnswerGenerator(),
      });

      console.log(`\n${result.answer}`);
      console.log("\nFragmentos proporcionados al modelo:");

      for (const source of result.sources) {
        console.log(
          `[${source.id}] ${source.source} — fragmento ${source.chunkIndex + 1}`,
        );
      }

      return;
    }

    if (command === "search") {
      const repository: IndexRepository =
        new JsonIndexRepository(filePath);

      const results = await searchDocuments(question, {
        repository,
        createEmbeddingGenerator: (model) =>
          new OllamaEmbeddingGenerator(model),
      });

      console.log(`Fragmentos encontrados: ${results.length}`);

      for (const [position, result] of results.entries()) {
        console.log(
          `\nResultado ${position + 1} | Similitud: ${result.score.toFixed(4)}`,
        );
        console.log(
          `Origen: ${result.source} | Fragmento: ${result.chunkIndex + 1}`,
        );
        console.log(result.text);
      }

      return;
    }

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
