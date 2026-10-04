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
    models: [],
    embeddedTexts: [],
    answerRequests: [],
  };

  const dependencies = {
    repository: {
      async load() {
        return documentIndex;
      },

      async save() {
        assert.fail("Responder no debe modificar el índice.");
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

  const result = await answerQuestion("  Mi pregunta  ", dependencies);

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

test("passes the requested result limit to the search", async () => {
  const { dependencies, calls } = makeDependencies();

  const result = await answerQuestion("Pregunta", dependencies, 1);

  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].id, "F1");
  assert.equal(result.sources[0].chunkIndex, 1);
  assert.equal(calls.answerRequests[0].fragments.length, 1);
});

test("rejects an empty question without generating an answer", async () => {
  const { dependencies, calls } = makeDependencies();

  await assert.rejects(
    answerQuestion("   ", dependencies),
    /pregunta no puede estar vacía/,
  );

  assert.deepEqual(calls.embeddedTexts, []);
  assert.deepEqual(calls.answerRequests, []);
});

test("does not generate an answer when loading the index fails", async () => {
  const { dependencies, calls } = makeDependencies();

  dependencies.repository.load = async () => {
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