import assert from "node:assert/strict";
import { test } from "node:test";
import { UsageTracker } from "../dist/application/progress.js";

test("marks cumulative usage unavailable if a model omits token counts", () => {
  const events = [];
  const tracker = new UsageTracker(event => events.push(event));

  tracker.record("query-embedding", { model: "embedding", inputTokens: null, outputTokens: 0 });
  tracker.record("answer", { model: "chat", inputTokens: 12, outputTokens: 3 });

  assert.deepEqual(events.map(event => event.cumulative), [
    { inputTokens: null, outputTokens: 0 },
    { inputTokens: null, outputTokens: 3 },
  ]);
});
