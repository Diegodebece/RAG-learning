import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { JsonIndexRepository } from "../dist/infrastructure/files/json-index-repository.js";

function makeIndex() {
  return {
    version: 1,
    source: "documents/ejemplo.txt",
    embeddingModel: "test-model",
    dimensions: 3,
    chunking: { maxChars: 500, overlapChars: 0 },
    chunks: [
      { index: 0, text: "Información de prueba.", embedding: [0.12, -0.45, 0.08] },
      { index: 1, text: "Segundo fragmento.", embedding: [0.23, 0.91, -0.37] },
    ],
  };
}

async function makeDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), "rag1-index-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("saves and reloads all data from a new repository without calling Ollama", async (t) => {
  const directory = await makeDirectory(t);
  const filePath = join(directory, "nested", "index.json");
  const original = makeIndex();
  t.mock.method(globalThis, "fetch", () => {
    assert.fail("Persistence must not call Ollama");
  });

  await new JsonIndexRepository(filePath).save(original);
  const loaded = await new JsonIndexRepository(filePath).load();

  assert.deepEqual(loaded, original);
  assert.notEqual(loaded, original);
  assert.deepEqual(JSON.parse(await readFile(filePath, "utf8")), original);
  assert.deepEqual(await readdir(join(directory, "nested")), ["index.json"]);
});

test("reindexing replaces the old document instead of appending duplicates", async (t) => {
  const directory = await makeDirectory(t);
  const repository = new JsonIndexRepository(join(directory, "index.json"));
  await repository.save(makeIndex());
  const updated = makeIndex();
  updated.chunks = [{ index: 0, text: "Texto actualizado.", embedding: [0.3, 0.4, 0.5] }];

  await repository.save(updated);

  assert.deepEqual(await repository.load(), updated);
  assert.deepEqual(await readdir(directory), ["index.json"]);
});

test("rejects non-finite vectors before writing and preserves the old index", async (t) => {
  const directory = await makeDirectory(t);
  const repository = new JsonIndexRepository(join(directory, "index.json"));
  const original = makeIndex();
  await repository.save(original);

  for (const invalidNumber of [NaN, Infinity, -Infinity]) {
    const invalid = makeIndex();
    invalid.chunks[0].embedding[0] = invalidNumber;
    await assert.rejects(repository.save(invalid), /fragmento/);
  }

  assert.deepEqual(await repository.load(), original);
});

test("reports missing files and malformed JSON", async (t) => {
  const directory = await makeDirectory(t);
  const filePath = join(directory, "index.json");
  const repository = new JsonIndexRepository(filePath);
  await assert.rejects(repository.load(), /No se pudo leer el índice/);
  await writeFile(filePath, "{", "utf8");
  await assert.rejects(repository.load(), /no contiene JSON válido/);
});

test("validates metadata, fragment order, text and vectors when loading", async (t) => {
  const directory = await makeDirectory(t);
  const filePath = join(directory, "index.json");
  const repository = new JsonIndexRepository(filePath);
  const invalidCases = [
    index => { index.version = 2; },
    index => { delete index.source; },
    index => { index.embeddingModel = ""; },
    index => { index.dimensions = 0; },
    index => { index.chunking.maxChars = -1; },
    index => { index.chunking.overlapChars = 500; },
    index => { index.chunks = []; },
    index => { index.chunks[1].index = 0; },
    index => { index.chunks[0].text = ""; },
    index => { index.chunks[0].text = "x".repeat(501); },
    index => { index.chunks[0].embedding = [0.1]; },
    index => { index.chunks[0].embedding[0] = "0.1"; },
    index => { index.chunks[0].embedding[0] = null; },
  ];

  for (const change of invalidCases) {
    const invalid = makeIndex();
    change(invalid);
    await writeFile(filePath, JSON.stringify(invalid), "utf8");
    await assert.rejects(repository.load());
  }
});
