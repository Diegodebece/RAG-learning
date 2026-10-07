import { join, parse } from "node:path";
import type { IndexRepository } from "./application/ports/index-repository.js";
import { indexDocument } from "./application/index-document.js";
import { readTextFile } from "./infrastructure/files/read-text-file.js";
import { JsonIndexRepository } from "./infrastructure/files/json-index-repository.js";
import { JsonIndexReader } from "./infrastructure/files/json-index-reader.js";
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
    console.error('  npm start -- search <indice.json-o-carpeta> "<pregunta>"');
    console.error('  npm start -- ask <indice.json-o-carpeta> "<pregunta>"');
    process.exitCode = 1;
    return;
  }
  try {
    if (command === "ask") {
      const indexReader = new JsonIndexReader(filePath);

      console.log("Buscando fragmentos y generando respuesta...");

      const result = await answerQuestion(question, {
        indexReader,
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
      const indexReader = new JsonIndexReader(filePath);

      const results = await searchDocuments(question, {
        indexReader,
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

    const content = await readTextFile(filePath);
    const indexPath = join("data", `${parse(filePath).name}.json`);
    const repository: IndexRepository = new JsonIndexRepository(indexPath);

    console.log("Indexando documento...");

    const documentIndex = await indexDocument(
      {
        source: filePath,
        text: content,
        embeddingModel: "qwen3-embedding:0.6b",
        maxChars: 500,
      },
      {
        repository,
        createEmbeddingGenerator: (model) =>
          new OllamaEmbeddingGenerator(model),
      },
    );

    if (documentIndex === null) {
      console.log("El archivo está vacío o solo contiene espacios.");
      return;
    }

    console.log(`Fragmentos generados: ${documentIndex.chunks.length}`);

    for (const chunk of documentIndex.chunks) {
      console.log(`\nFragmento ${chunk.index + 1} (${chunk.text.length} caracteres):`);
      console.log(chunk.text);
      console.log(`Embedding válido: ${chunk.embedding.length} dimensiones.`);
    }

    console.log(`\nÍndice en memoria: ${documentIndex.chunks.length} fragmentos con sus embeddings.`);
    console.log(`Origen: ${documentIndex.source}`);
    console.log(`Modelo: ${documentIndex.embeddingModel}`);
    console.log(`Dimensiones: ${documentIndex.dimensions}`);

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
