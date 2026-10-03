import type { DocumentIndex } from "../../domain/document-index.js";

export interface IndexRepository {
  save(index: DocumentIndex): Promise<void>;
  load(): Promise<DocumentIndex>;
}
