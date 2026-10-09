import { join, parse } from "node:path";
import type { IndexRepository } from "./application/ports/index-repository.js";
import { indexDocument } from "./application/index-document.js";
import { readDocument } from "./infrastructure/files/read-document.js";
import { confirmPartialExtraction } from "./infrastructure/cli/confirm-partial-extraction.js";
import { MIN_PDF_PAGE_CHARACTERS } from "./infrastructure/files/read-pdf-file.js";
import { JsonIndexRepository } from "./infrastructure/files/json-index-repository.js";
import { JsonIndexReader } from "./infrastructure/files/json-index-reader.js";
import { OllamaEmbeddingGenerator } from "./infrastructure/ollama/ollama-embedding-generator.js";
import { DEFAULT_MIN_SCORE, searchDocuments } from "./application/search-documents.js";
import { answerQuestion } from "./application/answer-question.js";
import { OllamaAnswerGenerator } from "./infrastructure/ollama/ollama-answer-generator.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const [command, filePath, question, option, optionValue] = args;

  const isIndexCommand = command === "index" && args.length === 2;
  const hasValidSearchArgs = args.length === 3 ||
    (args.length === 5 && option === "--min-score" && optionValue?.trim() !== "");
  const isSearchCommand = command === "search" && hasValidSearchArgs;
  const isAskCommand = command === "ask" && hasValidSearchArgs;

  if (!filePath || (!isIndexCommand && !isSearchCommand && !isAskCommand)) {
    console.error("Uso:");
    console.error("  npm start -- index <archivo.txt-pdf-o-docx>");
    console.error('  npm start -- search <indice.json-o-carpeta> "<pregunta>" [--min-score <valor>]');
    console.error('  npm start -- ask <indice.json-o-carpeta> "<pregunta>" [--min-score <valor>]');
    process.exitCode = 1;
    return;
  }
  try {
    const minScore = optionValue === undefined ? DEFAULT_MIN_SCORE : Number(optionValue);

    if (command === "ask") {
      const indexReader = new JsonIndexReader(filePath);

      console.log("Buscando fragmentos relevantes...");

      const result = await answerQuestion(question, {
        indexReader,
        createEmbeddingGenerator: (model) =>
          new OllamaEmbeddingGenerator(model),
        answerGenerator: new OllamaAnswerGenerator(),
      }, 3, minScore);

      console.log(`\n${result.answer}`);

      if (result.sources.length > 0) {
        console.log("\nFragmentos proporcionados al modelo:");
      }

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
      }, 3, minScore);

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

    const extraction = await readDocument(filePath);
    const content = extraction.text;
    if (extraction.format === "docx" && content === "") {
      throw new Error("El DOCX no contiene texto extraíble. No se generó ningún índice.");
    }
    if (extraction.format === "pdf") {

      if (content === "") {
        throw new Error("El PDF no contiene texto extraíble. Podría necesitar OCR. No se generó ningún índice.");
      }

      // Regla orientativa: al menos la mitad de las páginas tiene poco texto.
      if (extraction.pagesWithLittleText / extraction.totalPages >= 0.5) {
        console.warn("Extracción posiblemente incompleta:");
        console.warn(`${extraction.totalPages} páginas, ${content.length} caracteres extraídos.`);
        console.warn(`${extraction.pagesWithLittleText} páginas tienen menos de ${MIN_PDF_PAGE_CHARACTERS} caracteres.`);
        console.warn("El documento podría contener páginas escaneadas.");
        const confirmed = await confirmPartialExtraction();
        if (!confirmed) {
          console.error("Indexación cancelada. No se generaron embeddings ni se modificó el índice.");
          process.exitCode = 1;
          return;
        }
        console.warn("Continuando con el texto recuperado.");
      }
    }
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
