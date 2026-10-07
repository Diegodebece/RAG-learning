import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { JsonIndexReader } from "../dist/infrastructure/files/json-index-reader.js";

function makeIndex(source) {
  return {
    version: 1,
    source,
    embeddingModel: "test-model",
    dimensions: 2,
    chunking: { maxChars: 500, overlapChars: 0 },
    chunks: [{ index: 0, text: "Texto de prueba.", embedding: [0.1, 0.2] }],
  };
}

async function makeDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), "rag1-reader-test-"));
  t.after(async () => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

test("loads a single JSON index without changing the stored file", async (t) => {
  const directory = await makeDirectory(t);
  const filePath = join(directory, "single.json");
  const index = makeIndex("documents/único.txt");
  const original = JSON.stringify(index);
  await writeFile(filePath, original, "utf8");

  assert.deepEqual(await new JsonIndexReader(filePath).loadAll(), [index]);
  assert.equal(await readFile(filePath, "utf8"), original);
});

test("loads direct JSON files in name order, ignoring other files and subfolders", async (t) => {
  const directory = await makeDirectory(t);
  const first = makeIndex("documents/primero.txt");
  const second = makeIndex("documents/segundo.txt");
  await writeFile(join(directory, "b.JSON"), JSON.stringify(second));
  await writeFile(join(directory, "a.json"), JSON.stringify(first));
  await writeFile(join(directory, "notes.txt"), "not JSON");
  await writeFile(join(directory, "a.json.tmp"), "incomplete temporary file");
  await mkdir(join(directory, "nested.json"));
  await writeFile(join(directory, "nested.json", "broken.json"), "{");
  t.mock.method(globalThis, "fetch", () => assert.fail("Reading indexes must not call Ollama"));

  assert.deepEqual(await new JsonIndexReader(directory).loadAll(), [first, second]);
});

test("returns an empty collection when there are no JSON files", async (t) => {
  const directory = await makeDirectory(t);
  const reader = new JsonIndexReader(directory);
  assert.deepEqual(await reader.loadAll(), []);
  await writeFile(join(directory, "notes.txt"), "Some notes");
  assert.deepEqual(await reader.loadAll(), []);
});

test("rejects missing paths", async (t) => {
  const directory = await makeDirectory(t);
  await assert.rejects(
    new JsonIndexReader(join(directory, "missing.json")).loadAll(),
    { code: "ENOENT" },
  );
});

test("identifies a broken JSON file instead of silently skipping it", async (t) => {
  const directory = await makeDirectory(t);
  await writeFile(join(directory, "valid.json"), JSON.stringify(makeIndex("valid.txt")));
  await writeFile(join(directory, "broken.json"), "{");

  await assert.rejects(new JsonIndexReader(directory).loadAll(), /broken\.json.*JSON válido/);
});

test("validates the schema of each index and identifies the invalid file", async (t) => {
  const directory = await makeDirectory(t);
  await writeFile(join(directory, "invalid.json"), JSON.stringify({ version: 1 }));
  await assert.rejects(new JsonIndexReader(directory).loadAll(), /invalid\.json.*origen/);
});
