import assert from "node:assert/strict";
import { test } from "node:test";
import { answerQuestion } from "../dist/application/answer-question.js";

function makeDependencies() {
  const documentIndex = {
    version: 1,
    source: "documents/ejemplo.txt",
    embeddingModel: "test-embedding-model",
    dimensions: 2,
    chunking: { maxChars: 500, overlapChars: 0 },
    chunks: [
      { index: 0, text: "Primer fragmento.", embedding: [0, 1] },
      { index: 1, text: "Segundo fragmento.", embedding: [1, 0] },
      { index: 2, text: "Tercer fragmento.", embedding: [0.8, 0.6] },
    ],
  };

  const calls = {
    loads: 0,
    models: [],
    embeddedTexts: [],
    answerRequests: [],
  };

  const dependencies = {
    indexReader: {
      async loadAll() {
        calls.loads++;
        return [documentIndex];
      },
    },

    createEmbeddingGenerator(model) {
      calls.models.push(model);

      return {
        async generate(text) {
          calls.embeddedTexts.push(text);
          return [1, 0];
        },
      };
    },

    answerGenerator: {
      async generate(question, fragments) {
        calls.answerRequests.push({ question, fragments });
        return "Respuesta de prueba. [F1]";
      },
    },
  };

  return { dependencies, calls };
}

test("generates an answer using the retrieved fragments and returns their sources", async () => {
  const { dependencies, calls } = makeDependencies();

  const result = await answerQuestion("  Mi pregunta  ", dependencies, 3, -1);

  assert.equal(result.answer, "Respuesta de prueba. [F1]");
  assert.deepEqual(calls.models, ["test-embedding-model"]);
  assert.deepEqual(calls.embeddedTexts, ["Mi pregunta"]);

  assert.equal(calls.answerRequests.length, 1);
  const request = calls.answerRequests[0];

  assert.equal(request.question, "Mi pregunta");
  assert.deepEqual(
    request.fragments.map(fragment => fragment.chunkIndex),
    [1, 2, 0],
  );

  assert.deepEqual(
    result.sources.map(source => source.id),
    ["F1", "F2", "F3"],
  );

  const sourcesWithoutIds = result.sources.map(({ id, ...source }) => source);
  assert.deepEqual(sourcesWithoutIds, request.fragments);
});

test("limits search matches while adding their adjacent chunks without loading twice", async () => {
  const { dependencies, calls } = makeDependencies();

  const result = await answerQuestion("Pregunta", dependencies, 1);

  assert.deepEqual(result.sources.map(source => [source.id, source.chunkIndex, source.retrieval]), [
    ["F1", 1, "match"],
    ["F2", 0, "neighbor"],
    ["F3", 2, "neighbor"],
  ]);
  assert.equal(result.sources[0].score, 1);
  assert.equal(result.sources[1].score, undefined);
  assert.equal(calls.answerRequests[0].fragments.length, 3);
  assert.equal(calls.loads, 1);
});

test("includes a neighboring chunk even when its score is below the search threshold", async () => {
  const { dependencies, calls } = makeDependencies();

  const result = await answerQuestion("Pregunta", dependencies, 1, 0.9);

  assert.deepEqual(result.sources.map(source => source.chunkIndex), [1, 0, 2]);
  assert.deepEqual(result.sources.map(source => source.retrieval), ["match", "neighbor", "neighbor"]);
  assert.deepEqual(calls.answerRequests[0].fragments.map(fragment => fragment.text), [
    "Segundo fragmento.", "Primer fragmento.", "Tercer fragmento.",
  ]);
});

test("rejects an empty question without generating an answer", async () => {
  const { dependencies, calls } = makeDependencies();

  await assert.rejects(
    answerQuestion("   ", dependencies),
    /question cannot be empty/,
  );

  assert.deepEqual(calls.embeddedTexts, []);
  assert.deepEqual(calls.answerRequests, []);
});

test("does not generate an answer when loading the index fails", async () => {
  const { dependencies, calls } = makeDependencies();

  dependencies.indexReader.loadAll = async () => {
    throw new Error("Índice no disponible");
  };

  await assert.rejects(
    answerQuestion("Pregunta", dependencies),
    /Índice no disponible/,
  );

  assert.deepEqual(calls.answerRequests, []);
});

test("propagates answer generation errors", async () => {
  const { dependencies } = makeDependencies();

  dependencies.answerGenerator.generate = async () => {
    throw new Error("El modelo no respondió");
  };

  await assert.rejects(
    answerQuestion("Pregunta", dependencies),
    /El modelo no respondió/,
  );
});

test("passes context from multiple documents with unique citation IDs and original fragment numbers", async () => {
  const { dependencies, calls } = makeDependencies();
  const [firstIndex] = await dependencies.indexReader.loadAll();
  const secondIndex = structuredClone(firstIndex);
  secondIndex.source = "documents/segundo.txt";
  secondIndex.chunks = [{ index: 0, text: "Otro documento.", embedding: [0.96, 0.28] }];
  dependencies.indexReader.loadAll = async () => [firstIndex, secondIndex];

  const result = await answerQuestion("Pregunta", dependencies, 3, -1);

  assert.deepEqual(result.sources.map(source => [source.id, source.source, source.chunkIndex]), [
    ["F1", firstIndex.source, 1],
    ["F2", secondIndex.source, 0],
    ["F3", firstIndex.source, 2],
    ["F4", firstIndex.source, 0],
  ]);
  assert.deepEqual(
    calls.answerRequests[0].fragments,
    result.sources.map(({ id, ...source }) => source),
  );
  assert.deepEqual(calls.embeddedTexts, ["Pregunta"]);
});

test("skips answer generation when no fragment reaches the threshold", async () => {
  const { dependencies, calls } = makeDependencies();

  let embeddingCalls = 0;
  dependencies.createEmbeddingGenerator = () => ({
    async generate() {
      embeddingCalls++;
      return [0, -1];
    },
  });
  const result = await answerQuestion("Pregunta", dependencies, 3, 0.9);

  assert.match(result.answer, /No chunks in the indexed documents/);
  assert.deepEqual(result.sources, []);
  assert.deepEqual(calls.answerRequests, []);
  assert.equal(embeddingCalls, 1);
});

test("does not generate an answer for empty or incompatible collections", async () => {
  for (const empty of [true, false]) {
    const { dependencies, calls } = makeDependencies();
    const [firstIndex] = await dependencies.indexReader.loadAll();
    const secondIndex = { ...firstIndex, embeddingModel: "another-model" };
    dependencies.indexReader.loadAll = async () => empty ? [] : [firstIndex, secondIndex];

    await assert.rejects(answerQuestion("Pregunta", dependencies));
    assert.deepEqual(calls.models, []);
    assert.deepEqual(calls.answerRequests, []);
  }
});
