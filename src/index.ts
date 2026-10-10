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
    console.error("Usage:");
    console.error("  npm start -- index <file.txt-pdf-or-docx>");
    console.error('  npm start -- search <index.json-or-directory> "<question>" [--min-score <value>]');
    console.error('  npm start -- ask <index.json-or-directory> "<question>" [--min-score <value>]');
    process.exitCode = 1;
    return;
  }
  try {
    const minScore = optionValue === undefined ? DEFAULT_MIN_SCORE : Number(optionValue);

    if (command === "ask") {
      const indexReader = new JsonIndexReader(filePath);

      console.log("Searching for relevant chunks...");

      const result = await answerQuestion(question, {
        indexReader,
        createEmbeddingGenerator: (model) =>
          new OllamaEmbeddingGenerator(model),
        answerGenerator: new OllamaAnswerGenerator(),
      }, 3, minScore);

      console.log(`\n${result.answer}`);

      if (result.sources.length > 0) {
        console.log("\nChunks provided to the model:");
      }

      for (const source of result.sources) {
        const origin = source.retrieval === "match"
          ? `search match (similarity: ${source.score?.toFixed(4)})`
          : "neighboring chunk";
        console.log(
          `[${source.id}] ${source.source} — chunk ${source.chunkIndex + 1} — ${origin}`,
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

      console.log(`Chunks found: ${results.length}`);

      for (const [position, result] of results.entries()) {
        console.log(
          `\nResult ${position + 1} | Similarity: ${result.score.toFixed(4)}`,
        );
        console.log(
          `Source: ${result.source} | Chunk: ${result.chunkIndex + 1}`,
        );
        console.log(result.text);
      }

      return;
    }

    const extraction = await readDocument(filePath);
    const content = extraction.text;
    if (extraction.format === "docx" && content === "") {
      throw new Error("The DOCX contains no extractable text. No index was created.");
    }
    if (extraction.format === "pdf") {

      if (content === "") {
        throw new Error("The PDF contains no extractable text. It may require OCR. No index was created.");
      }

      // Regla orientativa: al menos la mitad de las páginas tiene poco texto.
      if (extraction.pagesWithLittleText / extraction.totalPages >= 0.5) {
        console.warn("Text extraction may be incomplete:");
        console.warn(`${extraction.totalPages} pages, ${content.length} characters extracted.`);
        console.warn(`${extraction.pagesWithLittleText} pages contain fewer than ${MIN_PDF_PAGE_CHARACTERS} characters.`);
        console.warn("The document may contain scanned pages.");
        const confirmed = await confirmPartialExtraction();
        if (!confirmed) {
          console.error("Indexing canceled. No embeddings were generated and the index was not changed.");
          process.exitCode = 1;
          return;
        }
        console.warn("Continuing with the extracted text.");
      }
    }
    const indexPath = join("data", `${parse(filePath).name}.json`);
    const repository: IndexRepository = new JsonIndexRepository(indexPath);

    console.log("Indexing document...");

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
      console.log("The file is empty or contains only whitespace.");
      return;
    }

    console.log(`Chunks generated: ${documentIndex.chunks.length}`);

    for (const chunk of documentIndex.chunks) {
      console.log(`\nChunk ${chunk.index + 1} (${chunk.text.length} characters):`);
      console.log(chunk.text);
      console.log(`Valid embedding: ${chunk.embedding.length} dimensions.`);
    }

    console.log(`\nIndex in memory: ${documentIndex.chunks.length} chunks with embeddings.`);
    console.log(`Source: ${documentIndex.source}`);
    console.log(`Model: ${documentIndex.embeddingModel}`);
    console.log(`Dimensions: ${documentIndex.dimensions}`);

    console.log(`Index saved to: ${indexPath}`);

    const savedIndex = await repository.load();
    console.log(
      `Index loaded from JSON: ${savedIndex.chunks.length} chunks with ${savedIndex.dimensions} dimensions.`,
    );
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      console.error(`File not found: ${filePath}`);
    } else {
      const detail = error instanceof Error ? error.message : "Unknown error";
      console.error(`Could not process the file: ${detail}`);
    }

    process.exitCode = 1;
  }
}

await main();
