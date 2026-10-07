import { readdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import type { IndexReader } from "../../application/ports/index-reader.js";
import type { DocumentIndex } from "../../domain/document-index.js";
import { JsonIndexRepository } from "./json-index-repository.js";

export class JsonIndexReader implements IndexReader {
  constructor(private readonly inputPath: string) {}

  async loadAll(): Promise<DocumentIndex[]> {
    const info = await stat(this.inputPath);
    let filePaths: string[];

    if (info.isDirectory()) {
      const entries = await readdir(this.inputPath, { withFileTypes: true });
      filePaths = entries
        .filter(entry => entry.isFile() && extname(entry.name).toLowerCase() === ".json")
        .map(entry => join(this.inputPath, entry.name))
        .sort();
    } else if (info.isFile()) {
      filePaths = [this.inputPath];
    } else {
      throw new Error(`La ruta ${this.inputPath} debe ser un archivo o una carpeta de índices.`);
    }

    const indexes: DocumentIndex[] = [];

    for (const filePath of filePaths) {
      try {
        // Reutilizamos la lectura y validación del formato de un único índice.
        indexes.push(await new JsonIndexRepository(filePath).load());
      } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : "Error desconocido";
        throw new Error(`No se pudo cargar el índice ${filePath}: ${detail}`);
      }
    }

    return indexes;
  }
}
