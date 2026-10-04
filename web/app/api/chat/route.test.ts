import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "./route.ts";

test("POST returns a streaming response that includes an actual text answer", async () => {
  const request = new Request("http://localhost/api/chat", {
    method: "POST",
    body: JSON.stringify({
      messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "What is Silicon Valley Community Foundation?" }] }],
    }),
  });

  const response = await POST(request);
  assert.equal(response.status, 200);
  assert.ok(response.body, "expected a streamed response body");

  const body = await response.text();
  // Regression guard: without stopWhen allowing a step past the first tool
  // call, the agent stops after tool-output-available and never emits a
  // text-delta — the stream still returns 200, so only inspecting the body
  // content catches this.
  assert.match(body, /"type":"text-delta"/, "expected the model to synthesize a text answer after any tool calls");
});

test("POST still answers via custom tools when the MCP connection fails (bad token)", async () => {
  const originalToken = process.env.SANITY_CONTEXT_TOKEN;
  process.env.SANITY_CONTEXT_TOKEN = "not-a-real-token";
  try {
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "What organizations has Silicon Valley Community Foundation funded?" }] }],
      }),
    });

    const response = await POST(request);
    assert.equal(response.status, 200, "route.ts's try/catch around createMCPClient must swallow the failure, not propagate it");

    const body = await response.text();
    assert.match(body, /"type":"text-delta"/, "expected a real answer from the custom tools even though MCP is unreachable");
  } finally {
    if (originalToken) process.env.SANITY_CONTEXT_TOKEN = originalToken;
  }
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
