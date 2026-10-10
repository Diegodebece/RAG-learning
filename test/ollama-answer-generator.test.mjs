import assert from "node:assert/strict";
import { test } from "node:test";
import { OllamaAnswerGenerator } from "../dist/infrastructure/ollama/ollama-answer-generator.js";

const fragments = [
  {
    source: "documents/ejemplo.txt",
    chunkIndex: 3,
    text: "Información del cuarto fragmento.",
  },
  {
    source: "documents/ejemplo.txt",
    chunkIndex: 0,
    text: "Información del primer fragmento.",
  },
];

test("sends the question, context and instructions to Ollama", async (t) => {
  let requestCount = 0;

  t.mock.method(globalThis, "fetch", async (url, options) => {
    requestCount++;

    assert.equal(url, "http://localhost:11434/api/chat");
    assert.equal(options.method, "POST");
    assert.equal(options.headers["Content-Type"], "application/json");

    const body = JSON.parse(options.body);

    assert.equal(body.model, "qwen3.5:4b");
    assert.equal(body.stream, false);
    assert.equal(body.think, false);

    const [systemMessage, userMessage] = body.messages;

    assert.equal(systemMessage.role, "system");
    assert.match(systemMessage.content, /Answer the user's question briefly in English/);
    assert.match(systemMessage.content, /Use only information from the provided chunks/);
    assert.match(systemMessage.content, /I cannot find enough information/);

    assert.equal(userMessage.role, "user");
    assert.deepEqual(JSON.parse(userMessage.content), {
      question: "Mi pregunta",
      fragments: [
        {
          id: "F1",
          source: "documents/ejemplo.txt",
          fragment: 4,
          text: "Información del cuarto fragmento.",
        },
        {
          id: "F2",
          source: "documents/ejemplo.txt",
          fragment: 1,
          text: "Información del primer fragmento.",
        },
      ],
    });

    return Response.json({
      message: { content: "  Respuesta de prueba. [F1]  " },
    });
  });

  const answer = await new OllamaAnswerGenerator().generate(
    "  Mi pregunta  ",
    fragments,
  );

  assert.equal(answer, "Respuesta de prueba. [F1]");
  assert.equal(requestCount, 1);
});

test("supports a different model and server", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "http://localhost:12345/api/chat");
    assert.equal(JSON.parse(options.body).model, "another-model");

    return Response.json({
      message: { content: "Respuesta. [F1]" },
    });
  });

  const generator = new OllamaAnswerGenerator(
    "another-model",
    "http://localhost:12345",
  );

  assert.equal(
    await generator.generate("Pregunta", fragments),
    "Respuesta. [F1]",
  );
});

test("returns insufficient information without calling Ollama when context is empty", async (t) => {
  t.mock.method(globalThis, "fetch", () => {
    assert.fail("No debe llamar a Ollama sin fragmentos.");
  });

  const answer = await new OllamaAnswerGenerator().generate("Pregunta", []);

  assert.equal(
    answer,
    "I cannot find enough information in the provided chunks to answer.",
  );
});

test("rejects an empty question before calling Ollama", async (t) => {
  t.mock.method(globalThis, "fetch", () => {
    assert.fail("No debe llamar a Ollama con una pregunta vacía.");
  });

  await assert.rejects(
    new OllamaAnswerGenerator().generate("   ", fragments),
    /question cannot be empty/,
  );
});

test("rejects responses without valid text", async (t) => {
  const invalidResponses = [
    null,
    {},
    { message: null },
    { message: {} },
    { message: { content: 123 } },
    { message: { content: "   " } },
  ];

  for (const data of invalidResponses) {
    await t.test(JSON.stringify(data), async (subtest) => {
      subtest.mock.method(
        globalThis,
        "fetch",
        async () => Response.json(data),
      );

      await assert.rejects(
        new OllamaAnswerGenerator().generate("Pregunta", fragments),
        /valid text content/,
      );
    });
  }
});

test("reports HTTP errors with the server details", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: "model not found" }, { status: 404 }),
  );

  await assert.rejects(
    new OllamaAnswerGenerator().generate("Pregunta", fragments),
    /HTTP 404.*model not found/,
  );
});

test("reports when Ollama is unavailable", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("fetch failed");
  });

  await assert.rejects(
    new OllamaAnswerGenerator().generate("Pregunta", fragments),
    /Could not connect to Ollama/,
  );
});

test("reports a request timeout", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new DOMException("Timed out", "TimeoutError");
  });

  await assert.rejects(
    new OllamaAnswerGenerator().generate("Pregunta", fragments),
    /120 seconds/,
  );
});
