import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { IndexRepository } from "../../application/ports/index-repository.js";
import type { DocumentIndex } from "../../domain/document-index.js";
import { validateDocumentIndex } from "./validate-document-index.js";

export class JsonIndexRepository implements IndexRepository {
  constructor(private readonly filePath: string) {}

  async save(index: DocumentIndex): Promise<void> {
    validateDocumentIndex(index);
    await mkdir(dirname(this.filePath), { recursive: true });

    // El archivo anterior se reemplaza cuando termina la escritura del nuevo.
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;

    try {
      await writeFile(temporaryPath, JSON.stringify(index, null, 2), "utf8");
      await rename(temporaryPath, this.filePath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  async load(): Promise<DocumentIndex> {
    let content: string;

    try {
      content = await readFile(this.filePath, "utf8");
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : "Error desconocido";
      throw new Error(`No se pudo leer el índice ${this.filePath}: ${detail}`);
    }

    let data: unknown;

    try {
      data = JSON.parse(content);
    } catch {
      throw new Error(`El archivo ${this.filePath} no contiene JSON válido.`);
    }

    validateDocumentIndex(data);
    return data;
  }
}
