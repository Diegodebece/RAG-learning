import assert from "node:assert/strict";
import { test } from "node:test";
import { indexDocument } from "../dist/application/index-document.js";

function makeDependencies(vectors = [[0.1, 0.2], [0.3, 0.4]]) {
  const calls = { models: [], texts: [], saved: [], events: [] };
  const dependencies = {
    repository: {
      async save(index) {
        calls.events.push("save");
        calls.saved.push(structuredClone(index));
      },
      async load() {
        assert.fail("Indexing should not load an existing index.");
      },
    },
    createEmbeddingGenerator(model) {
      calls.models.push(model);
      return {
        async generate(text) {
          calls.events.push(`generate:${text}`);
          calls.texts.push(text);
          return vectors[calls.texts.length - 1];
        },
      };
    },
  };
  return { dependencies, calls };
}

const input = {
  source: "documents/ejemplo.txt",
  text: "uno dos tres",
  embeddingModel: "test-model",
  maxChars: 7,
};

test("builds and saves a complete index with the configured model and chunk size", async () => {
  const { dependencies, calls } = makeDependencies();
  const result = await indexDocument(input, dependencies);

  const expected = {
    version: 1,
    source: input.source,
    embeddingModel: input.embeddingModel,
    dimensions: 2,
    chunking: { maxChars: 7, overlapChars: 0 },
    chunks: [
      { index: 0, text: "uno dos", embedding: [0.1, 0.2] },
      { index: 1, text: "tres", embedding: [0.3, 0.4] },
    ],
  };

  assert.deepEqual(result, expected);
  assert.deepEqual(calls.saved, [expected]);
  assert.deepEqual(calls.models, ["test-model"]);
  assert.deepEqual(calls.texts, ["uno dos", "tres"]);
  assert.deepEqual(calls.events, ["generate:uno dos", "generate:tres", "save"]);
});

test("defaults to 500 characters without overlap", async () => {
  const { dependencies } = makeDependencies();
  const result = await indexDocument({
    source: input.source,
    embeddingModel: input.embeddingModel,
    text: "x".repeat(500) + " fin",
  }, dependencies);

  assert.deepEqual(result.chunking, { maxChars: 500, overlapChars: 0 });
  assert.deepEqual(result.chunks.map(chunk => chunk.text.length), [500, 3]);
});

test("empty documents return null without generating vectors or overwriting an index", async () => {
  for (const text of ["", " \n\t "]) {
    const { dependencies, calls } = makeDependencies();
    assert.equal(await indexDocument({ ...input, text }, dependencies), null);
    assert.deepEqual(calls.models, []);
    assert.deepEqual(calls.events, []);
  }
});

test("rejects invalid configuration before generating or saving", async () => {
  const invalidInputs = [
    { ...input, source: " " },
    { ...input, embeddingModel: "" },
    { ...input, maxChars: 0 },
    { ...input, maxChars: 1.5 },
    { ...input, text: "palabralarga" },
  ];

  for (const invalid of invalidInputs) {
    const { dependencies, calls } = makeDependencies();
    await assert.rejects(indexDocument(invalid, dependencies));
    assert.deepEqual(calls.models, []);
    assert.deepEqual(calls.saved, []);
  }
});

test("does not save a partial index when vector dimensions differ", async () => {
  const { dependencies, calls } = makeDependencies([[1, 2], [1, 2, 3]]);
  await assert.rejects(indexDocument(input, dependencies), /dimensiones/);
  assert.equal(calls.texts.length, 2);
  assert.deepEqual(calls.saved, []);
});

test("rejects empty or non-finite embeddings before saving", async () => {
  for (const vector of [[], [NaN, 1], [Infinity, 1], [-Infinity, 1]]) {
    const { dependencies, calls } = makeDependencies([vector]);
    await assert.rejects(indexDocument(input, dependencies), /embedding vacío o con números no finitos/);
    assert.deepEqual(calls.saved, []);
  }
});

test("propagates embedding failures without saving a partial index", async () => {
  const { dependencies, calls } = makeDependencies();
  dependencies.createEmbeddingGenerator = () => ({
    async generate(text) {
      if (text === "tres") throw new Error("Embedding unavailable");
      return [0.1, 0.2];
    },
  });

  await assert.rejects(indexDocument(input, dependencies), /Embedding unavailable/);
  assert.deepEqual(calls.saved, []);
});

test("propagates persistence failures instead of returning success", async () => {
  const { dependencies } = makeDependencies();
  dependencies.repository.save = async () => {
    throw new Error("Disk unavailable");
  };

  await assert.rejects(indexDocument(input, dependencies), /Disk unavailable/);
});
