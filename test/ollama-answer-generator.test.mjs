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
    assert.equal(body.stream, true);
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
      done: true,
      message: { content: "  Respuesta de prueba. [F1]  " },
      prompt_eval_count: 120,
      eval_count: 8,
    });
  });

  const textEvents = [];
  const usageEvents = [];
  const answer = await new OllamaAnswerGenerator().generate(
    "  Mi pregunta  ",
    fragments,
    usage => usageEvents.push(usage),
    text => textEvents.push(text),
  );

  assert.equal(answer, "Respuesta de prueba. [F1]");
  assert.deepEqual(textEvents, ["  Respuesta de prueba. [F1]  "]);
  assert.deepEqual(usageEvents, [{ model: "qwen3.5:4b", inputTokens: 120, outputTokens: 8 }]);
  assert.equal(requestCount, 1);
});

test("supports a different model and server", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "http://localhost:12345/api/chat");
    assert.equal(JSON.parse(options.body).model, "another-model");

    return Response.json({
      done: true,
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

test("streams answer text before reporting final token usage", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('{"message":{"content":"Hello "},"done":false}\n{"mess'));
        controller.enqueue(encoder.encode('age":{"content":"world"},"done":false}\n'));
        controller.enqueue(encoder.encode('{"message":{"content":""},"done":true,"prompt_eval_count":12,"eval_count":2}\n'));
        controller.close();
      },
    }));
  });

  const events = [];
  const answer = await new OllamaAnswerGenerator().generate(
    "Question", fragments,
    usage => events.push(["usage", usage]),
    text => events.push(["text", text]),
  );

  assert.equal(answer, "Hello world");
  assert.deepEqual(events, [
    ["text", "Hello "],
    ["text", "world"],
    ["usage", { model: "qwen3.5:4b", inputTokens: 12, outputTokens: 2 }],
  ]);
});

test("rejects a truncated stream instead of returning a partial answer", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(
    '{"message":{"content":"Partial answer"},"done":false}\n',
  ));

  await assert.rejects(
    new OllamaAnswerGenerator().generate("Question", fragments),
    /before completion/,
  );
});

test("reports errors sent within a successful HTTP stream", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(
    '{"error":"model stopped unexpectedly"}\n',
  ));

  await assert.rejects(
    new OllamaAnswerGenerator().generate("Question", fragments),
    /Ollama stream error: model stopped unexpectedly/,
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
        async () => Response.json(data === null ? data : { ...data, done: true }),
      );

      await assert.rejects(
        new OllamaAnswerGenerator().generate("Pregunta", fragments),
        /valid text content|invalid response stream event/,
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
