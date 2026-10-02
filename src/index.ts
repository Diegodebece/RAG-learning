import type { EmbeddingGenerator } from "./application/ports/embedding-generator.js";
import { chunkText } from "./domain/chunk-text.js";
import { readTextFile } from "./infrastructure/files/read-text-file.js";
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
    const content = await readTextFile(filePath);
    const chunks = chunkText(content);

    if (chunks.length === 0) {
      console.log("El archivo está vacío o solo contiene espacios.");
      return;
    }

    console.log(`Fragmentos generados: ${chunks.length}`);

    const embeddingGenerator: EmbeddingGenerator = new OllamaEmbeddingGenerator();
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
      console.log(`Embedding válido: ${embedding.length} dimensiones.`);
    }
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
