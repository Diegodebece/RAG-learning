# RAG Learning — Local Question Answering over Documents

> 🚧 **Work in progress.** I'm building this to learn how Retrieval-Augmented Generation (RAG) works from the ground up. Core features work, and more are planned (see Roadmap).

A command-line app in TypeScript that answers questions about your own text documents using a local LLM through [Ollama](https://ollama.com). The retrieval pipeline is written from scratch, with no RAG framework such as LangChain: text chunking, embeddings, cosine-similarity search and answers with citations.

## How it works

1. **Index:** reads a `.txt` file, splits it into chunks, generates an embedding for each chunk and saves the index as JSON.
2. **Search:** loads a JSON index or a folder of indexes, embeds the question once and returns the most similar chunks across all documents with their similarity score.
3. **Ask:** sends the best chunks to the LLM, which answers in Spanish **using only those chunks** and cites them as `[F1]`, `[F2]`. If the chunks don't contain the answer, it says so instead of making one up. The prompt also tells the model to treat document text as data and to ignore any instructions inside it.

## Tech

- TypeScript (strict) on Node.js, no runtime dependencies
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

npm start -- index documents/lavalleja.txt
npm start -- search data/lavalleja.json "¿Dónde nació Lavalleja?"
npm start -- ask data/lavalleja.json "¿Dónde nació Lavalleja?"

# Search or ask across all JSON indexes in data/
npm start -- index documents/example.txt
npm start -- search data "¿Dónde nació Lavalleja?"
npm start -- ask data "¿Dónde nació Lavalleja?"
```

Folder queries read only directly contained `.json` files (not subfolders).
All indexes must use the same embedding model and vector dimensions; incompatible
or invalid indexes produce an error before any model is called. Empty folders
also produce an error. The default limit is three results across the entire
collection, with no minimum similarity threshold. Each result preserves its
document of origin for citations. Indexing still processes one `.txt` file at a time.

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

- [ ] Minimum similarity threshold: skip the LLM when no chunk is relevant
- [ ] Validate citations returned by the model
- [ ] Evaluation set with expected answers and an accuracy score
- [ ] Sentence-aware chunking with overlap
- [x] Search and answer across multiple persisted document indexes
- [ ] Batch indexing of document folders
- [ ] CI with GitHub Actions
- [ ] HTTP API, web UI and Docker setup
