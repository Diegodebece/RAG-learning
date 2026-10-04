import assert from "node:assert/strict";
import { test } from "node:test";
import { searchDocuments } from "../dist/application/search-documents.js";

function makeDependencies() {
  const documentIndex = {
    version: 1,
    source: "documents/ejemplo.txt",
    embeddingModel: "test-model",
    dimensions: 2,
    chunking: { maxChars: 500, overlapChars: 0 },
    chunks: [
      { index: 0, text: "Perpendicular.", embedding: [0, 1] },
      { index: 1, text: "Misma dirección.", embedding: [1, 0] },
      { index: 2, text: "Dirección cercana.", embedding: [0.8, 0.6] },
      { index: 3, text: "Dirección opuesta.", embedding: [-1, 0] },
    ],
  };

  const calls = {
    loads: 0,
    models: [],
    questions: [],
  };

  const dependencies = {
    repository: {
      async load() {
        calls.loads++;
        return documentIndex;
      },

      async save() {
        assert.fail("La búsqueda no debe guardar ni modificar el índice.");
      },
    },

    createEmbeddingGenerator(model) {
      calls.models.push(model);

      return {
        async generate(text) {
          calls.questions.push(text);
          return [1, 0];
        },
      };
    },
  };

  return { dependencies, calls, documentIndex };
}

test("returns the top three fragments using the stored model", async () => {
  const { dependencies, calls, documentIndex } = makeDependencies();
  const original = structuredClone(documentIndex);

  const results = await searchDocuments("  Mi pregunta  ", dependencies);

  assert.deepEqual(
    results.map(result => result.chunkIndex),
    [1, 2, 0],
  );

  assert.equal(results[0].text, "Misma dirección.");
  assert.ok(results.every(result => result.source === documentIndex.source));

  assert.equal(results[0].score, 1);
  assert.ok(Math.abs(results[1].score - 0.8) < 1e-10);
  assert.equal(results[2].score, 0);

  assert.equal(calls.loads, 1);
  assert.deepEqual(calls.models, ["test-model"]);
  assert.deepEqual(calls.questions, ["Mi pregunta"]);

  assert.deepEqual(documentIndex, original);
});

test("respects the limit without inventing additional results", async () => {
  const { dependencies } = makeDependencies();

  const oneResult = await searchDocuments("Pregunta", dependencies, 1);
  assert.equal(oneResult.length, 1);
  assert.equal(oneResult[0].chunkIndex, 1);

  const allResults = await searchDocuments("Pregunta", dependencies, 10);
  assert.deepEqual(
    allResults.map(result => result.chunkIndex),
    [1, 2, 0, 3],
  );
});

test("rejects an empty question before loading the index", async () => {
  const { dependencies, calls } = makeDependencies();

  await assert.rejects(
    searchDocuments("   ", dependencies),
    /pregunta no puede estar vacía/,
  );

  assert.equal(calls.loads, 0);
  assert.deepEqual(calls.questions, []);
});

test("rejects invalid result limits", async () => {
  const { dependencies, calls } = makeDependencies();

  for (const limit of [0, -1, 1.5, NaN, Infinity]) {
    await assert.rejects(
      searchDocuments("Pregunta", dependencies, limit),
      /entero positivo/,
    );
  }

  assert.equal(calls.loads, 0);
});

test("rejects a question embedding with incompatible dimensions", async () => {
  const { dependencies } = makeDependencies();

  dependencies.createEmbeddingGenerator = () => ({
    async generate() {
      return [1, 0, 0];
    },
  });

  await assert.rejects(
    searchDocuments("Pregunta", dependencies),
    /dimensión.*no coincide/,
  );
});