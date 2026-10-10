import assert from "node:assert/strict";
import { test } from "node:test";
import { OllamaEmbeddingGenerator } from "../dist/infrastructure/ollama/ollama-embedding-generator.js";

test("sends a whole fragment to Ollama and returns its vector", async (t) => {
  const fragment = "Un fragmento completo con varias palabras.";

  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "http://localhost:11434/api/embed");
    assert.equal(options.method, "POST");
    assert.equal(options.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(options.body), {
      model: "qwen3-embedding:0.6b",
      input: fragment,
      truncate: false,
    });
    return Response.json({ embeddings: [[0.12, -0.45, 0.08]] });
  });

  assert.deepEqual(await new OllamaEmbeddingGenerator().generate(fragment), [0.12, -0.45, 0.08]);
});

test("allows changing the model and server address", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "http://localhost:12345/api/embed");
    assert.equal(JSON.parse(options.body).model, "another-model");
    return Response.json({ embeddings: [[0.5]] });
  });

  const generator = new OllamaEmbeddingGenerator("another-model", "http://localhost:12345");
  assert.deepEqual(await generator.generate("texto"), [0.5]);
});

test("rejects malformed or ambiguous vectors", async (t) => {
  const invalidResponses = [
    null,
    {},
    { embeddings: [] },
    { embeddings: [[]] },
    { embeddings: [["0.12"]] },
    { embeddings: [[null]] },
    { embeddings: [[0.12], [0.45]] },
  ];

  for (const data of invalidResponses) {
    await t.test(JSON.stringify(data), async (subtest) => {
      subtest.mock.method(globalThis, "fetch", async () => Response.json(data));
      await assert.rejects(new OllamaEmbeddingGenerator().generate("texto"), /finite numbers/);
    });
  }
});

test("reports an HTTP error with the server details", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: "model not found" }, { status: 404 }),
  );

  await assert.rejects(new OllamaEmbeddingGenerator().generate("texto"), /HTTP 404.*model not found/);
});

test("reports when Ollama is unavailable", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("fetch failed");
  });

  await assert.rejects(new OllamaEmbeddingGenerator().generate("texto"), /Could not connect to Ollama/);
});

test("reports a request timeout", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new DOMException("Timed out", "TimeoutError");
  });

  await assert.rejects(new OllamaEmbeddingGenerator().generate("texto"), /120 seconds/);
});
