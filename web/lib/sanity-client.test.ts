import { test } from "node:test";
import assert from "node:assert/strict";
import { sanityQuery } from "./sanity-client.ts";

test("SANITY_READ_TOKEN permits reading seeded organization documents", async () => {
  const count = await sanityQuery<number>('count(*[_type == "organization"])');
  assert.ok(count > 0, `expected seeded organizations, got count=${count}`);
});
