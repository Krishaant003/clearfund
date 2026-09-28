import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "./route.ts";

test("POST returns a streaming response for a simple question", async () => {
  const request = new Request("http://localhost/api/chat", {
    method: "POST",
    body: JSON.stringify({
      messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "What is Sanity Context?" }] }],
    }),
  });

  const response = await POST(request);
  assert.equal(response.status, 200);
  assert.ok(response.body, "expected a streamed response body");
});

test("POST surfaces a clear error if required env vars are missing", async () => {
  const originalOrgId = process.env.SANITY_ORG_ID;
  delete process.env.SANITY_ORG_ID;
  try {
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [] }),
    });
    await assert.rejects(POST(request), /Missing required environment variable: SANITY_ORG_ID/);
  } finally {
    if (originalOrgId) process.env.SANITY_ORG_ID = originalOrgId;
  }
});
