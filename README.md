# RAG Learning — Local Question Answering over Documents

> 🚧 **Work in progress.** I'm building this to learn how Retrieval-Augmented Generation (RAG) works from the ground up. Core features work, and more are planned (see Roadmap).

A command-line app in TypeScript that answers questions about your own text documents using a local LLM through [Ollama](https://ollama.com). The retrieval pipeline is written from scratch, with no RAG framework such as LangChain: text chunking, embeddings, cosine-similarity search and answers with citations.

## How it works

1. **Index:** reads a `.txt`, text-based `.pdf`, or `.docx` file, splits it into chunks, generates an embedding for each chunk and saves the index as JSON.
2. **Search:** loads a JSON index or a folder of indexes, embeds the question once and returns the most similar chunks across all documents with their similarity score.
3. **Ask:** sends the best chunks to the LLM, which answers in Spanish **using only those chunks** and cites them as `[F1]`, `[F2]`. If the chunks don't contain the answer, it says so instead of making one up. The prompt also tells the model to treat document text as data and to ignore any instructions inside it.

## Tech

- TypeScript (strict) on Node.js, with `pdf-parse` for PDF and `mammoth` for DOCX text extraction
- Ollama: `qwen3-embedding:0.6b` for embeddings, `qwen3.5:4b` for answers
- Node's built-in test runner
- Layered architecture (domain / application / infrastructure). Ollama and storage sit behind interfaces, so the tests run with fakes and don't need Ollama.

## Getting started

Requirements: Node.js 22+ and Ollama running locally.

```bash
ollama pull qwen3-embedding:0.6b
ollama pull qwen3.5:4b
npm install
npm run build

npm start -- index documents/example.txt
npm start -- search data/example.json "¿Qué usa RAG1 para generar embeddings?"
npm start -- ask data/example.json "¿Qué usa RAG1 para generar embeddings?"

# Search or ask across all JSON indexes in data/
npm start -- search data "¿Qué usa RAG1 para generar embeddings?"
npm start -- ask data "¿Qué usa RAG1 para generar embeddings?"
```

Folder queries read only directly contained `.json` files (not subfolders).
All indexes must use the same embedding model and vector dimensions; incompatible
or invalid indexes produce an error before any model is called. Empty folders
also produce an error. The default limit is three results across the entire
collection, with no minimum similarity threshold. Each result preserves its
document of origin for citations. Indexing processes one `.txt`, `.pdf`, or `.docx` file at a time.

PDF extraction uses selectable text only, without OCR or table reconstruction.
If at least half of the pages contain fewer than 50 trimmed text characters,
indexing asks `¿Querés continuar? [s/N]` before generating embeddings or writing an index. This is a
heuristic: sparse pages may be legitimate, and passing the check does not
guarantee complete extraction. Enter `s` and press Enter to continue with the
recovered text. Enter, any other answer, or closing input cancels indexing.
There is no need to rerun the command or add a flag:

```bash
npm start -- index documents/manual.pdf
```

PDFs with no extractable text are rejected without asking for confirmation. References
retain the original PDF path and chunk number, without page numbers.

DOCX uses plain-text extraction without image recognition or table reconstruction:

```bash
npm start -- index documents/report.docx
```

Empty DOCX extraction stops before calling Ollama or modifying an index. DOCX
does not provide reliable page counts through this reader, so the PDF page
heuristic does not apply. Legacy `.doc` files are not supported.

Dependency audit (2026-10-09): npm reports three moderate alerts from the single
`sprintf-js` advisory GHSA-hp3w-g68c-fv3c, propagated through `argparse` to Mammoth.
Mammoth uses `argparse` in its standalone CLI; this app uses `extractRawText`
through the library API. The alerts remain unresolved; npm's suggested fix
downgrades Mammoth to 0.3.29 and has not been applied.

Run the tests (Ollama not required):

```bash
npm test
```

## Project structure

```
src/
  domain/          chunking, cosine similarity, index model
  application/     use cases: index, search, answer (+ ports)
  infrastructure/  Ollama clients, JSON index storage
test/              unit tests with fake dependencies
documents/         sample texts
```

## Roadmap

- [x] Search and answer across multiple persisted document indexes
- [x] Read and index text-based PDF and DOCX documents
- [ ] Minimum similarity threshold: skip the LLM when no chunk is relevant
- [ ] Validate citations returned by the model
- [ ] Evaluation set with expected answers and an accuracy score
- [ ] Sentence-aware chunking with overlap
- [ ] Batch indexing of document folders
- [ ] CI with GitHub Actions
- [ ] HTTP API, web UI and Docker setup
