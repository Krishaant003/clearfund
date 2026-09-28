import { test } from "node:test";
import assert from "node:assert/strict";
import { withBackoff } from "./with-backoff.ts";

function rateLimitError(retryAfterSeconds?: number): Error & { statusCode: number; response?: unknown } {
  const error = new Error("Rate limit exceeded") as Error & {
    statusCode: number;
    response?: { headers: { get: (name: string) => string | null } };
  };
  error.statusCode = 429;
  if (retryAfterSeconds !== undefined) {
    error.response = {
      headers: { get: (name: string) => (name.toLowerCase() === "retry-after" ? String(retryAfterSeconds) : null) },
    };
  }
  return error;
}

test("retries on 429 and eventually succeeds", async () => {
  let calls = 0;
  const result = await withBackoff(
    async () => {
      calls++;
      if (calls < 3) throw rateLimitError(0);
      return "ok";
    },
    { retries: 5, baseDelayMs: 1 }
  );
  assert.equal(result, "ok");
  assert.equal(calls, 3);
});

test("does not retry on non-429 errors", async () => {
  let calls = 0;
  await assert.rejects(
    withBackoff(async () => {
      calls++;
      throw new Error("not a rate limit error");
    }),
    /not a rate limit error/
  );
  assert.equal(calls, 1);
});

test("throws after exhausting retries", async () => {
  let calls = 0;
  await assert.rejects(
    withBackoff(
      async () => {
        calls++;
        throw rateLimitError(0);
      },
      { retries: 2, baseDelayMs: 1 }
    )
  );
  assert.equal(calls, 3); // initial attempt + 2 retries
});

// Regression guard: @sanity/client's real ClientError shape (verified against
// the installed @sanity/client@8.7.0) has response.headers as a plain object
// via its internal headersToRecord(), not a Fetch Headers instance with
// .get(). The fake used above pins the wrong shape.
function sanityClientErrorShape(retryAfterSeconds?: number): Error & { statusCode: number; response: unknown } {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (retryAfterSeconds !== undefined) headers["retry-after"] = String(retryAfterSeconds);
  const error = new Error("Too Many Requests") as Error & { statusCode: number; response: unknown };
  error.statusCode = 429;
  error.response = { statusCode: 429, statusMessage: "Too Many Requests", headers, body: {}, url: "https://x.api.sanity.io/v1/data/query/production", method: "GET" };
  return error;
}

test("retries a real @sanity/client-shaped 429 (plain-object headers) instead of throwing a TypeError", async () => {
  let calls = 0;
  const result = await withBackoff(
    async () => {
      calls++;
      if (calls < 2) throw sanityClientErrorShape(0);
      return "ok";
    },
    { retries: 3, baseDelayMs: 1 }
  );
  assert.equal(result, "ok");
  assert.equal(calls, 2);
});
