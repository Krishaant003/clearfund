import { test } from "node:test";
import assert from "node:assert/strict";
import { sanityQuery, sanityClient } from "./sanity-client.ts";

test("SANITY_READ_TOKEN permits reading seeded organization documents", async () => {
  const count = await sanityQuery<number>('count(*[_type == "organization"])');
  assert.ok(count > 0, `expected seeded organizations, got count=${count}`);
});

// Regression guard: @sanity/client@8.7.0 retries 429/502/503 internally by
// default (maxRetries: 5) on top of withBackoff's own retries, so a single
// sustained 429 could trigger up to ~24 attempts. withBackoff is the one
// deliberate retry layer (spec requires it); the client's own must be off.
test("sanityClient disables @sanity/client's own built-in retries", () => {
  assert.equal(sanityClient.config().maxRetries, 0);
});
