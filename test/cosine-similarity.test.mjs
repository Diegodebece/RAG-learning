import assert from "node:assert/strict";
import { test } from "node:test";
import { cosineSimilarity } from "../dist/domain/cosine-similarity.js";

test("vectors pointing in the same direction have similarity 1", () => {
  assert.equal(cosineSimilarity([1, 0], [2, 0]), 1);
});

test("perpendicular vectors have similarity 0", () => {
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});

test("vectors pointing in opposite directions have similarity -1", () => {
  assert.equal(cosineSimilarity([1, 0], [-1, 0]), -1);
});

test("calculates similarity for vectors with multiple components", () => {
  const result = cosineSimilarity([1, 2], [2, 1]);

  assert.ok(Math.abs(result - 0.8) < 1e-10);
});

test("rejects empty vectors or different dimensions", () => {
  assert.throws(() => cosineSimilarity([], []), /same dimensions/);
  assert.throws(() => cosineSimilarity([1, 2], [1]), /same dimensions/);
});

test("rejects vectors with zero magnitude", () => {
  assert.throws(
    () => cosineSimilarity([0, 0], [1, 2]),
    /magnitud cero/,
  );

  assert.throws(
    () => cosineSimilarity([1, 2], [0, 0]),
    /magnitud cero/,
  );
});

test("rejects non-finite numbers in either vector", () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.throws(
      () => cosineSimilarity([value, 1], [1, 2]),
      /finite numbers/,
    );

    assert.throws(
      () => cosineSimilarity([1, 2], [value, 1]),
      /finite numbers/,
    );
  }
});
