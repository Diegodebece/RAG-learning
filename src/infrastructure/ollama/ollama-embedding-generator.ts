import type { EmbeddingGenerator } from "../../application/ports/embedding-generator.js";

function isEmbedding(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item: unknown) => typeof item === "number" && Number.isFinite(item))
  );
}

export class OllamaEmbeddingGenerator implements EmbeddingGenerator {
  constructor(
    private readonly model: string = "qwen3-embedding:0.6b",
    private readonly baseUrl: string = "http://localhost:11434",
  ) {}

  async generate(text: string): Promise<number[]> {
    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.model, input: text, truncate: false }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new Error("Ollama no respondió en el límite de 120 segundos.");
      }

      throw new Error(
        `No se pudo conectar con Ollama en ${this.baseUrl}. Verificá que esté ejecutándose.`,
      );
    }

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Ollama devolvió HTTP ${response.status}: ${detail}`);
    }

    const data: unknown = await response.json();

    if (
      typeof data !== "object" ||
      data === null ||
      !("embeddings" in data) ||
      !Array.isArray(data.embeddings) ||
      data.embeddings.length !== 1 ||
      !isEmbedding(data.embeddings[0])
    ) {
      throw new Error(
        "Ollama debe devolver exactamente un vector no vacío con números finitos por fragmento.",
      );
    }

    return data.embeddings[0];
  }
}
