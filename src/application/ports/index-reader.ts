import type { DocumentIndex } from "../../domain/document-index.js";

export interface IndexReader {
  loadAll(): Promise<DocumentIndex[]>;
}
