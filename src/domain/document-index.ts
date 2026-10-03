export interface IndexedChunk {
  index: number;
  text: string;
  embedding: number[];
}

export interface DocumentIndex {
  version: 1;
  source: string;
  embeddingModel: string;
  dimensions: number;
  chunking: {
    maxChars: number;
    overlapChars: number;
  };
  chunks: IndexedChunk[];
}
