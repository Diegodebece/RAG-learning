export interface EmbeddingGenerator {
  generate(text: string): Promise<number[]>;
}
