import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { readPdfFile } from "../dist/infrastructure/files/read-pdf-file.js";

// PDF mínimo: permite probar la extracción real sin otra dependencia.
function makePdf(...pages) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  for (const [index, text] of pages.entries()) {
    const stream = text ? `BT /F1 12 Tf 72 720 Td (${text}) Tj ET\n` : "";
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
    );
  }
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}

async function makeDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), "rag1-pdf-test-"));
  t.after(async () => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

test("extracts PDF text without generated page markers", async (t) => {
  const directory = await makeDirectory(t);
  const filePath = join(directory, "document.pdf");
  await writeFile(filePath, makePdf("Lavalleja nacio en Minas."));
  assert.deepEqual(await readPdfFile(filePath), {
    text: "Lavalleja nacio en Minas.", totalPages: 1, pagesWithLittleText: 1,
  });
});

test("returns empty text for a PDF with no extractable text", async (t) => {
  const directory = await makeDirectory(t);
  const filePath = join(directory, "empty.pdf");
  await writeFile(filePath, makePdf(""));
  assert.deepEqual(await readPdfFile(filePath), {
    text: "", totalPages: 1, pagesWithLittleText: 1,
  });
});

test("rejects a missing PDF", async (t) => {
  const directory = await makeDirectory(t);
  await assert.rejects(readPdfFile(join(directory, "missing.pdf")), { code: "ENOENT" });
});

test("rejects a file that is not a valid PDF", async (t) => {
  const directory = await makeDirectory(t);
  const filePath = join(directory, "broken.pdf");
  await writeFile(filePath, "This is not a PDF.");
  await assert.rejects(readPdfFile(filePath));
});

test("counts sparse pages independently of the total extracted text", async (t) => {
  const directory = await makeDirectory(t);
  const filePath = join(directory, "mixed.pdf");
  await writeFile(filePath, makePdf("a".repeat(50), "b".repeat(49), ""));
  const result = await readPdfFile(filePath);
  assert.equal(result.totalPages, 3);
  assert.equal(result.pagesWithLittleText, 2);
  assert.equal(result.text, `${"a".repeat(50)}\n\n${"b".repeat(49)}`);
});

const execFileAsync = promisify(execFile);
const entryPoint = new URL("../dist/index.js", import.meta.url).href;

test("CLI indexes DOCX text with its original source and no page confirmation", async (t) => {
  const directory = await makeDirectory(t);
  await copyFile(new URL("./fixtures/simple.docx", import.meta.url), join(directory, "sample.DOCX"));
  const result = await runIndex(directory, ["sample.DOCX"], true);
  assert.equal(result.code, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /Querés continuar/);
  const index = JSON.parse(await readFile(join(directory, "data", "sample.json"), "utf8"));
  assert.equal(index.source, "sample.DOCX");
  assert.equal(index.chunks[0].text, "Lavalleja nació en Minas. Documento de prueba para RAG1.");
});

test("CLI rejects empty DOCX before embedding or writing an index", async (t) => {
  const directory = await makeDirectory(t);
  await copyFile(new URL("./fixtures/empty.docx", import.meta.url), join(directory, "empty.docx"));
  const result = await runIndex(directory, ["empty.docx"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /DOCX no contiene texto extraíble/);
  assert.doesNotMatch(result.stderr, /EMBEDDING_REQUEST/);
  assert.doesNotMatch(result.stdout, /Querés continuar/);
  await assert.rejects(readFile(join(directory, "data", "empty.json")), { code: "ENOENT" });
});

async function runIndex(directory, args, allowEmbedding = false, answer = "\n") {
  // Ejecutamos el CLI real con Ollama simulado y un directorio de datos aislado.
  const script = `
    process.argv = [process.execPath, "index.js", "index", ...${JSON.stringify(args)}];
    globalThis.fetch = async () => {
      console.error("EMBEDDING_REQUEST");
      if (!${allowEmbedding}) throw new Error("Unexpected embedding request");
      return new Response(JSON.stringify({ embeddings: [[0.1, 0.2]] }));
    };
    await import(${JSON.stringify(entryPoint)});
  `;
  try {
    const execution = execFileAsync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: directory, timeout: 10000,
    });
    let output = "";
    let responded = false;
    execution.child.stdout.on("data", (chunk) => {
      output += chunk;
      if (!responded && output.includes("¿Querés continuar? [s/N]")) {
        responded = true;
        execution.child.stdin.end(answer ?? "");
      }
    });
    const result = await execution;
    return { ...result, code: 0 };
  } catch (error) {
    if (typeof error.code !== "number") throw error;
    return error;
  }
}

test("CLI blocks suspicious PDFs before Ollama and preserves an existing index", async (t) => {
  const directory = await makeDirectory(t);
  const { mkdir } = await import("node:fs/promises");
  await mkdir(join(directory, "data"));
  const indexPath = join(directory, "data", "mixed.json");
  await writeFile(indexPath, "existing index");
  await writeFile(join(directory, "mixed.pdf"), makePdf("Texto recuperado.", ""));
  const result = await runIndex(directory, ["mixed.pdf"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Extracción posiblemente incompleta/);
  assert.match(result.stdout, /¿Querés continuar\? \[s\/N\]/);
  assert.match(result.stderr, /Indexación cancelada/);
  assert.doesNotMatch(result.stderr, /EMBEDDING_REQUEST/);
  assert.equal(await readFile(indexPath, "utf8"), "existing index");
});

test("CLI permits suspicious extraction after an affirmative console answer", async (t) => {
  const directory = await makeDirectory(t);
  await writeFile(join(directory, "mixed.PDF"), makePdf("Texto recuperado.", ""));
  const result = await runIndex(directory, ["mixed.PDF"], true, " S \n");
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stderr, /Continuando con el texto recuperado/);
  const index = JSON.parse(await readFile(join(directory, "data", "mixed.json"), "utf8"));
  assert.equal(index.source, "mixed.PDF");
  assert.equal(index.chunks[0].text, "Texto recuperado.");
});

test("CLI rejects empty extraction without asking for confirmation", async (t) => {
  const directory = await makeDirectory(t);
  await writeFile(join(directory, "empty.pdf"), makePdf(""));
  const result = await runIndex(directory, ["empty.pdf"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /no contiene texto extraíble/);
  assert.doesNotMatch(result.stdout, /Querés continuar/);
  assert.doesNotMatch(result.stderr, /EMBEDDING_REQUEST/);
  await assert.rejects(readFile(join(directory, "data", "empty.json")), { code: "ENOENT" });
});

test("CLI indexes PDF text normally below the suspicious-page threshold", async (t) => {
  const directory = await makeDirectory(t);
  await writeFile(join(directory, "normal.pdf"), makePdf("a".repeat(50), "b".repeat(50), ""));
  const result = await runIndex(directory, ["normal.pdf"], true);
  assert.equal(result.code, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /Extracción posiblemente incompleta/);
  assert.doesNotMatch(result.stdout, /Querés continuar/);
});

test("CLI rejects an unknown option before extracting or embedding", async (t) => {
  const directory = await makeDirectory(t);
  const result = await runIndex(directory, ["missing.pdf", "--allow-partial-extraction"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Uso:/);
  assert.doesNotMatch(result.stderr, /EMBEDDING_REQUEST/);
});

for (const answer of ["n\n", "tal vez\n", null]) {
  test(`CLI cancels suspicious extraction for ${JSON.stringify(answer)} without calling Ollama`, async (t) => {
    const directory = await makeDirectory(t);
    await writeFile(join(directory, "mixed.pdf"), makePdf("Texto recuperado.", ""));
    const result = await runIndex(directory, ["mixed.pdf"], false, answer);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Indexación cancelada/);
    assert.doesNotMatch(result.stderr, /EMBEDDING_REQUEST/);
    await assert.rejects(readFile(join(directory, "data", "mixed.json")), { code: "ENOENT" });
  });
}
