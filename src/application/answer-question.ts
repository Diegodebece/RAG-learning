import type { AnswerGenerator } from "./ports/answer-generator.js";
import type { AnswerFragment } from "./ports/answer-generator.js";
import type { EmbeddingGenerator } from "./ports/embedding-generator.js";
import type { IndexReader } from "./ports/index-reader.js";
import { DEFAULT_MIN_SCORE, searchDocumentsWithIndexes } from "./search-documents.js";

export interface AnswerSource extends AnswerFragment {
  id: string;
  retrieval: "match" | "neighbor";
  score?: number;
}

export interface AnswerResult {
  answer: string;
  sources: AnswerSource[];
}

interface AnswerDependencies {
  indexReader: IndexReader;
  createEmbeddingGenerator: (model: string) => EmbeddingGenerator;
  answerGenerator: AnswerGenerator;
}

export async function answerQuestion(
  question: string,
  dependencies: AnswerDependencies,
  limit: number = 3,
  minScore: number = DEFAULT_MIN_SCORE,
): Promise<AnswerResult> {
  const { results, indexes } = await searchDocumentsWithIndexes(
    question,
    {
      indexReader: dependencies.indexReader,
      createEmbeddingGenerator: dependencies.createEmbeddingGenerator,
    },
    limit,
    minScore,
  );

  if (results.length === 0) {
    return {
      answer: "No chunks in the indexed documents were sufficiently related to the question.",
      sources: [],
    };
  }

  const fragments: Omit<AnswerSource, "id">[] = results.map(result => ({
    ...result,
    retrieval: "match",
  }));
  const included = new Set(results.map(result => `${result.source}\0${result.chunkIndex}`));
  const indexesBySource = new Map(indexes.map(index => [index.source, index]));

  for (const result of results) {
    const index = indexesBySource.get(result.source);
    if (index === undefined) continue;

    for (const neighborIndex of [result.chunkIndex - 1, result.chunkIndex + 1]) {
      const neighbor = index.chunks.find(chunk => chunk.index === neighborIndex);
      const key = `${result.source}\0${neighborIndex}`;
      if (neighbor === undefined || included.has(key)) continue;

      fragments.push({
        source: result.source,
        chunkIndex: neighbor.index,
        text: neighbor.text,
        retrieval: "neighbor",
      });
      included.add(key);
    }
  }

  const answer = await dependencies.answerGenerator.generate(question.trim(), fragments);
  const sources: AnswerSource[] = fragments.map((fragment, position) => ({
    ...fragment,
    id: `F${position + 1}`,
  }));

  return { answer, sources };
}
