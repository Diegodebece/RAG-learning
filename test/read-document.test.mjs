import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { readDocxFile } from "../dist/infrastructure/files/read-docx-file.js";
import { readDocument } from "../dist/infrastructure/files/read-document.js";

const fixture = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

async function makeDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), "rag1-document-test-"));
  t.after(async () => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

test("extracts DOCX paragraphs and accented text without formatting", async () => {
  assert.equal(await readDocxFile(fixture("simple.docx")),
    "Lavalleja nació en Minas.\n\nDocumento de prueba para RAG1.");
});

test("returns empty text for a DOCX without text", async () => {
  assert.equal(await readDocxFile(fixture("empty.docx")), "");
});

test("selects the DOCX reader without inventing page statistics", async () => {
  assert.deepEqual(await readDocument(fixture("simple.docx")), {
    format: "docx", text: "Lavalleja nació en Minas.\n\nDocumento de prueba para RAG1.",
  });
});

test("preserves TXT content and supports uppercase extensions", async (t) => {
  const directory = await makeDirectory(t);
  const path = join(directory, "sample.TXT");
  await writeFile(path, " Texto original.\n\n");
  assert.deepEqual(await readDocument(path), { format: "txt", text: " Texto original.\n\n" });
});

test("rejects a missing DOCX with the filesystem error code", async (t) => {
  const directory = await makeDirectory(t);
  await assert.rejects(readDocument(join(directory, "missing.docx")), { code: "ENOENT" });
});

test("rejects a corrupt DOCX", async (t) => {
  const directory = await makeDirectory(t);
  const path = join(directory, "broken.docx");
  await writeFile(path, "This is not a DOCX.");
  await assert.rejects(readDocument(path));
});

test("rejects unsupported and missing extensions", async () => {
  for (const path of ["old.doc", "image.png", "no-extension"]) {
    await assert.rejects(readDocument(path), /Unsupported format/);
  }
});
