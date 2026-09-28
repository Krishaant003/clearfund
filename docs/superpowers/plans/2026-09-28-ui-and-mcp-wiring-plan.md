# UI + Real MCP Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Build a deployed Next.js chat UI, backed by a real agent that
queries Sanity Context's MCP endpoint plus custom GROQ-based tools, that can
answer the flagship "how many hops before this donation reaches a program"
question with a cited, visually-rendered chain.

**Architecture:** A new `web/` Next.js App Router app, sibling to `sanity/`.
`app/api/chat/route.ts` runs `streamText` (Gemini via `@ai-sdk/google`) with
two tool sources merged: the live Sanity Context MCP client's tools, and our
own custom tools (`getGrantsByFunder`, `getGrantsByRecipient`,
`findIntermediaries`, `traceChain`) that query Sanity directly via
`@sanity/client`. `app/page.tsx` uses `useChat` for the conversational UI;
`components/ChainTrace.tsx` renders `traceChain`'s structured tool-result as
a diagram.

**Tech Stack:** Next.js (App Router), `@ai-sdk/react` (`useChat`), `ai`
(`streamText`, `tool`), `@ai-sdk/google`, `@ai-sdk/mcp` (`createMCPClient`),
`@sanity/client`, `zod`, TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-28-ui-and-mcp-wiring-design.md`
(design spec), which itself implements `spec.md` sections 5, 6, and 7.

## Global Constraints

- Endpoint URL pattern: `https://api.sanity.io/v1/context/organizations/<ORG_ID>/mcp/<name>`
  (spec §6) — the deployed Knowledge Base's MCP name must match what
  `agent/config.ts`'s `contextMcpUrl()` already hardcodes: `money-flow-agent`.
- Model: Gemini 3.5 Flash Lite via `@ai-sdk/google` (spec §6), same as the
  existing CLI stub.
- Every claim in the agent's answer must cite `sourceObjectId` per grant
  (spec §6, §8) — tool outputs must include it on every row.
- Sanity has no built-in client-side retry for 429s (confirmed: Sanity's own
  docs recommend implementing your own backoff/rate-limiting) — spec §7
  requires exponential backoff before live calls-in-a-loop exist, which is
  what this plan builds.
- AI SDK's `streamText` has built-in `maxRetries` (default 2) and
  `streamRetries` (default 0) that already retry transient 429/529 errors
  from the model provider — use these instead of hand-rolling Gemini-side
  retry logic; only Sanity-side calls need our own backoff helper.
- Deployed app is read-only (query only) — no document writes from the UI
  (spec's write path stays in `scripts/write-seed-data.ts`, run manually).

## Review Focus

- **MCP connection fails (bad token, wrong URL, endpoint not ready)** — the
  route should surface a clear error, not crash uninformatively. Pinned by
  Task 5's test.
- **`traceChain` called with an EIN not in the ~40 seeded orgs** — should
  return an empty/graceful result, not throw. Pinned by Task 4's test.
- **429 from Sanity mid-tool-call** — pinned by Task 2's `withBackoff` unit
  test and exercised for real in Task 3.
- **Missing `sourceObjectId` on a returned row** — every custom tool must
  include it; pinned by Task 4's tests asserting its presence on real data.
- **Gemini free-tier RPM/RPD exhaustion during a real multi-hop
  conversation** — this is an external quota limit, not something a unit
  test can simulate; `maxRetries`/`streamRetries` (Global Constraints) are
  the mitigation, and this is called out explicitly as a manual/operational
  risk to watch during real usage, not a coded test.

---

### Task 1: Scaffold the Next.js app

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/next.config.ts`
- Create: `web/app/layout.tsx`
- Create: `web/app/page.tsx` (placeholder, replaced in Task 6)
- Create: `web/.gitignore`

**Interfaces:**
- Produces: a working Next.js dev/build setup that later tasks add files into.

- [ ] **Step 1: Initialize package.json**
  Run: `cd web && npm init -y`
- [ ] **Step 2: Install dependencies**
  Run (from `web/`):
  ```bash
  npm install next react react-dom ai @ai-sdk/react @ai-sdk/google @ai-sdk/mcp @sanity/client zod
  npm install -D typescript @types/node @types/react @types/react-dom
  ```
- [ ] **Step 3: Set package.json scripts**
  Edit `web/package.json`, set `"type": "module"` (or leave CommonJS — Next.js
  handles either; keep consistent with root by using `"type": "module"`) and:
  ```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "test": "node --import tsx --test lib/*.test.ts"
  }
  ```
  Note: `web/`'s `test` script needs `tsx` too — add it:
  Run: `npm install -D tsx`
- [ ] **Step 4: Write tsconfig.json**
  `web/tsconfig.json`:
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "lib": ["dom", "dom.iterable", "ES2022"],
      "module": "ESNext",
      "moduleResolution": "Bundler",
      "jsx": "preserve",
      "strict": true,
      "esModuleInterop": true,
      "skipLibCheck": true,
      "noEmit": true,
      "allowImportingTsExtensions": true,
      "types": ["node"],
      "plugins": [{ "name": "next" }],
      "baseUrl": ".",
      "paths": { "@/*": ["./*"] }
    },
    "include": ["**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
    "exclude": ["node_modules"]
  }
  ```
- [ ] **Step 5: Write next.config.ts**
  `web/next.config.ts`:
  ```typescript
  import type { NextConfig } from "next";

  const nextConfig: NextConfig = {};

  export default nextConfig;
  ```
- [ ] **Step 6: Write root layout**
  `web/app/layout.tsx`:
  ```tsx
  export default function RootLayout({
    children,
  }: {
    children: React.ReactNode;
  }) {
    return (
      <html lang="en">
        <body>{children}</body>
      </html>
    );
  }
  ```
- [ ] **Step 7: Write placeholder page**
  `web/app/page.tsx`:
  ```tsx
  export default function Page() {
    return <div>Money Flow Agent</div>;
  }
  ```
- [ ] **Step 8: Write .gitignore**
  `web/.gitignore`:
  ```
  node_modules/
  .next/
  .env.local
  ```
- [ ] **Step 9: Verify build**
  Run: `cd web && npm run build`
  Expected: exits 0, Next.js reports a successful production build.
- [ ] **Step 10: Commit**
  ```bash
  git add web/
  git commit -m "chore: scaffold Next.js app in web/"
  ```

---

### Task 2: Exponential backoff helper (TDD)

**Files:**
- Create: `web/lib/with-backoff.ts`
- Test: `web/lib/with-backoff.test.ts`

**Interfaces:**
- Produces: `withBackoff<T>(fn: () => Promise<T>, options?: { retries?: number; baseDelayMs?: number }): Promise<T>`,
  consumed by Task 3's Sanity client wrapper and Task 4's tools.

- [ ] **Step 1: Write failing test**
  `web/lib/with-backoff.test.ts`:
  ```typescript
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
  ```
- [ ] **Step 2: Run test, verify it fails**
  Run: `cd web && npx tsx --test lib/with-backoff.test.ts`
  Expected: FAIL — `with-backoff.ts` does not exist yet.
- [ ] **Step 3: Write minimal implementation**
  `web/lib/with-backoff.ts`:
  ```typescript
  export interface BackoffOptions {
    retries?: number;
    baseDelayMs?: number;
  }

  function extractStatusCode(error: unknown): number | undefined {
    if (typeof error !== "object" || error === null) return undefined;
    const candidate = error as { statusCode?: number; status?: number };
    return candidate.statusCode ?? candidate.status;
  }

  function extractRetryAfterMs(error: unknown): number | undefined {
    if (typeof error !== "object" || error === null) return undefined;
    const response = (error as { response?: { headers?: { get: (name: string) => string | null } } }).response;
    const value = response?.headers?.get("retry-after");
    if (!value) return undefined;
    const seconds = Number(value);
    return Number.isFinite(seconds) ? seconds * 1000 : undefined;
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  export async function withBackoff<T>(fn: () => Promise<T>, options: BackoffOptions = {}): Promise<T> {
    const retries = options.retries ?? 3;
    const baseDelayMs = options.baseDelayMs ?? 1000;

    for (let attempt = 0; ; attempt++) {
      try {
        return await fn();
      } catch (error) {
        const status = extractStatusCode(error);
        if (status !== 429 || attempt >= retries) throw error;
        const delayMs = extractRetryAfterMs(error) ?? baseDelayMs * 2 ** attempt;
        await sleep(delayMs);
      }
    }
  }
  ```
- [ ] **Step 4: Run test, verify it passes**
  Run: `cd web && npx tsx --test lib/with-backoff.test.ts`
  Expected: PASS, 3/3 tests.
- [ ] **Step 5: Commit**
  ```bash
  git add web/lib/with-backoff.ts web/lib/with-backoff.test.ts
  git commit -m "feat: add exponential backoff helper for Sanity 429s"
  ```

---

### Task 3: Sanity client wrapper

**Files:**
- Create: `web/lib/sanity-client.ts`
- Test: `web/lib/sanity-client.test.ts`

**Interfaces:**
- Consumes: `withBackoff` from Task 2 (`web/lib/with-backoff.ts`).
- Produces: `sanityClient` (a configured `@sanity/client` instance) and
  `sanityQuery<T>(groqQuery: string, params?: Record<string, unknown>): Promise<T>`
  (wraps `sanityClient.fetch` with `withBackoff`), consumed by Task 4's tools.

- [ ] **Step 1: Write implementation**
  `web/lib/sanity-client.ts`:
  ```typescript
  import { createClient } from "@sanity/client";
  import { withBackoff } from "./with-backoff.ts";

  function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
  }

  export const sanityClient = createClient({
    projectId: requireEnv("SANITY_PROJECT_ID"),
    dataset: requireEnv("SANITY_DATASET"),
    token: requireEnv("SANITY_CONTEXT_TOKEN"),
    apiVersion: "2026-09-28",
    useCdn: false,
  });

  export async function sanityQuery<T>(groqQuery: string, params: Record<string, unknown> = {}): Promise<T> {
    return withBackoff(() => sanityClient.fetch<T>(groqQuery, params));
  }
  ```
- [ ] **Step 2: Write a real (non-mocked) verification test**
  This checks the open risk from the design spec directly: whether
  `SANITY_CONTEXT_TOKEN` (Context Viewer permission) actually permits GROQ
  reads.
  `web/lib/sanity-client.test.ts`:
  ```typescript
  import { test } from "node:test";
  import assert from "node:assert/strict";
  import { sanityQuery } from "./sanity-client.ts";

  test("SANITY_CONTEXT_TOKEN permits reading seeded organization documents", async () => {
    const count = await sanityQuery<number>('count(*[_type == "organization"])');
    assert.ok(count > 0, `expected seeded organizations, got count=${count}`);
  });
  ```
- [ ] **Step 3: Run test with real env vars**
  Run: `cd web && node --env-file=../.env --import tsx --test lib/sanity-client.test.ts`
  Expected: PASS. If it fails with a permissions error, `SANITY_CONTEXT_TOKEN`
  does not permit GROQ reads — ruling required: create a separate read-only
  project-level token and add it as a new env var (e.g. `SANITY_READ_TOKEN`),
  updating `sanity-client.ts` to use it instead. Record the ruling in the
  execution ledger either way — this was an explicitly flagged open risk in
  the design spec.
- [ ] **Step 4: Commit**
  ```bash
  git add web/lib/sanity-client.ts web/lib/sanity-client.test.ts
  git commit -m "feat: add Sanity client wrapper with backoff-wrapped queries"
  ```

---

### Task 4: Custom domain tools (TDD against real seeded data)

**Files:**
- Create: `web/lib/tools.ts`
- Test: `web/lib/tools.test.ts`

**Interfaces:**
- Consumes: `sanityQuery` from Task 3 (`web/lib/sanity-client.ts`).
- Produces: `tools` object (a `ToolSet`) with `getGrantsByFunder`,
  `getGrantsByRecipient`, `findIntermediaries`, `traceChain` — consumed by
  Task 5's API route. Also exports the `TraceChainResult`/`ChainHop` types,
  consumed by Task 7's `ChainTrace` component.

- [ ] **Step 1: Write failing tests**
  `web/lib/tools.test.ts`:
  ```typescript
  import { test } from "node:test";
  import assert from "node:assert/strict";
  import { tools } from "./tools.ts";

  const SVCF_EIN = "205205488";
  const FIDELITY_EIN = "110303001";

  test("getGrantsByFunder returns grants with citations for SVCF", async () => {
    const result = await tools.getGrantsByFunder.execute({ ein: SVCF_EIN });
    assert.ok(result.length > 0);
    for (const grant of result) {
      assert.ok(grant.sourceObjectId, "every grant must have a sourceObjectId citation");
      assert.ok(grant.recipient.ein);
    }
  });

  test("getGrantsByRecipient returns grants for Fidelity Charitable", async () => {
    const result = await tools.getGrantsByRecipient.execute({ ein: FIDELITY_EIN });
    assert.ok(result.length > 0);
    for (const grant of result) {
      assert.ok(grant.sourceObjectId);
      assert.ok(grant.funder.ein);
    }
  });

  test("findIntermediaries includes Fidelity Charitable", async () => {
    const result = await tools.findIntermediaries.execute({});
    const eins = result.map((org) => org.ein);
    assert.ok(eins.includes(FIDELITY_EIN));
  });

  test("traceChain from SVCF produces a multi-hop chain with citations", async () => {
    const result = await tools.traceChain.execute({ startingEin: SVCF_EIN, maxHops: 3 });
    assert.ok(result.hops.length > 0);
    assert.equal(result.hops[0].funder.ein, SVCF_EIN);
    for (const hop of result.hops) {
      assert.ok(hop.sourceObjectId);
    }
  });

  test("traceChain on an EIN with no grants returns an empty chain, not a throw", async () => {
    const result = await tools.traceChain.execute({ startingEin: "000000000", maxHops: 3 });
    assert.deepEqual(result.hops, []);
    assert.equal(result.endedReason, "no_further_grants");
  });
  ```
- [ ] **Step 2: Run tests, verify they fail**
  Run: `cd web && node --env-file=../.env --import tsx --test lib/tools.test.ts`
  Expected: FAIL — `tools.ts` does not exist yet.
- [ ] **Step 3: Write implementation**
  `web/lib/tools.ts`:
  ```typescript
  import { tool } from "ai";
  import { z } from "zod";
  import { sanityQuery } from "./sanity-client.ts";

  interface OrgRef {
    ein: string;
    name: string;
  }

  export interface GrantByFunderSummary {
    recipient: OrgRef;
    amountUsd: number;
    taxYear: number;
    grantPurpose: string | null;
    matchTier: string;
    sourceObjectId: string;
  }

  export interface GrantByRecipientSummary {
    funder: OrgRef;
    amountUsd: number;
    taxYear: number;
    grantPurpose: string | null;
    matchTier: string;
    sourceObjectId: string;
  }

  export interface ChainHop {
    funder: OrgRef;
    recipient: OrgRef;
    amountUsd: number;
    taxYear: number;
    sourceObjectId: string;
  }

  export interface TraceChainResult {
    hops: ChainHop[];
    endedReason: "max_hops" | "no_further_grants";
  }

  const getGrantsByFunder = tool({
    description: "Get all grants where the given organization (by EIN) is the funder.",
    inputSchema: z.object({ ein: z.string().describe("The funder's EIN") }),
    execute: async ({ ein }): Promise<GrantByFunderSummary[]> => {
      return sanityQuery<GrantByFunderSummary[]>(
        `*[_type == "grant" && funder->ein == $ein] | order(amountUsd desc) {
          amountUsd, taxYear, grantPurpose, matchTier, sourceObjectId,
          "recipient": recipient->{ein, name}
        }`,
        { ein }
      );
    },
  });

  const getGrantsByRecipient = tool({
    description: "Get all grants where the given organization (by EIN) is the recipient.",
    inputSchema: z.object({ ein: z.string().describe("The recipient's EIN") }),
    execute: async ({ ein }): Promise<GrantByRecipientSummary[]> => {
      return sanityQuery<GrantByRecipientSummary[]>(
        `*[_type == "grant" && recipient->ein == $ein] | order(amountUsd desc) {
          amountUsd, taxYear, grantPurpose, matchTier, sourceObjectId,
          "funder": funder->{ein, name}
        }`,
        { ein }
      );
    },
  });

  const findIntermediaries = tool({
    description: "Find organizations that are both a grant recipient and a grant funder somewhere in the dataset — genuine re-granting intermediaries.",
    inputSchema: z.object({}),
    execute: async (): Promise<OrgRef[]> => {
      return sanityQuery<OrgRef[]>(
        `*[_type == "organization"
          && count(*[_type == "grant" && recipient._ref == ^._id]) > 0
          && count(*[_type == "grant" && funder._ref == ^._id]) > 0
        ]{ein, name}`
      );
    },
  });

  const traceChain = tool({
    description: "Walk the funder-to-recipient chain starting from an organization's EIN, up to max_hops, following the largest grant at each step. Returns the hop-by-hop chain with citations.",
    inputSchema: z.object({
      startingEin: z.string().describe("EIN of the starting funder"),
      maxHops: z.number().int().min(1).max(5).default(3),
    }),
    execute: async ({ startingEin, maxHops }): Promise<TraceChainResult> => {
      const hops: ChainHop[] = [];
      let currentEin = startingEin;

      for (let i = 0; i < maxHops; i++) {
        const nextHop = await sanityQuery<ChainHop | null>(
          `*[_type == "grant" && funder->ein == $ein] | order(amountUsd desc) [0] {
            amountUsd, taxYear, sourceObjectId,
            "funder": funder->{ein, name},
            "recipient": recipient->{ein, name}
          }`,
          { ein: currentEin }
        );

        if (!nextHop) {
          return { hops, endedReason: "no_further_grants" };
        }

        hops.push(nextHop);
        currentEin = nextHop.recipient.ein;
      }

      return { hops, endedReason: "max_hops" };
    },
  });

  export const tools = {
    getGrantsByFunder,
    getGrantsByRecipient,
    findIntermediaries,
    traceChain,
  };
  ```
- [ ] **Step 4: Run tests, verify they pass**
  Run: `cd web && node --env-file=../.env --import tsx --test lib/tools.test.ts`
  Expected: PASS, 5/5 tests.
- [ ] **Step 5: Commit**
  ```bash
  git add web/lib/tools.ts web/lib/tools.test.ts
  git commit -m "feat: add custom GROQ-based agent tools with citations"
  ```

---

### Task 5: API route — real MCP client + custom tools + Gemini

**Files:**
- Create: `web/app/api/chat/route.ts`

**Interfaces:**
- Consumes: `tools` from Task 4 (`web/lib/tools.ts`).
- Produces: `POST` handler and `ChatMessage` type, consumed by Task 6's
  `app/page.tsx`.

- [ ] **Step 1: Write the route**
  `web/app/api/chat/route.ts`:
  ```typescript
  import { createMCPClient } from "@ai-sdk/mcp";
  import { google } from "@ai-sdk/google";
  import {
    convertToModelMessages,
    streamText,
    createUIMessageStreamResponse,
    toUIMessageStream,
    type InferUITools,
    type ToolSet,
    type UIDataTypes,
    type UIMessage,
  } from "ai";
  import { tools as customTools } from "@/lib/tools";

  export type ChatTools = InferUITools<typeof customTools>;
  export type ChatMessage = UIMessage<never, UIDataTypes, ChatTools>;

  function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
  }

  export async function POST(req: Request) {
    const { messages }: { messages: ChatMessage[] } = await req.json();

    const orgId = requireEnv("SANITY_ORG_ID");
    const contextToken = requireEnv("SANITY_CONTEXT_TOKEN");
    const mcpUrl = `https://api.sanity.io/v1/context/organizations/${orgId}/mcp/money-flow-agent`;

    let mcpTools: ToolSet = {};
    try {
      const mcpClient = await createMCPClient({
        transport: {
          type: "http",
          url: mcpUrl,
          headers: { Authorization: `Bearer ${contextToken}` },
        },
      });
      mcpTools = await mcpClient.tools();
    } catch (error) {
      console.error("Sanity Context MCP connection failed, continuing with custom tools only:", error);
    }

    const result = streamText({
      model: google("gemini-3.5-flash-lite"),
      maxRetries: 5,
      streamRetries: 2,
      system:
        "You trace US community foundation grants through re-granting intermediaries. " +
        "Cite the sourceObjectId for every grant claim you make. " +
        "Use traceChain to answer questions about how many hops a donation takes before reaching a program.",
      messages: convertToModelMessages(messages),
      tools: { ...mcpTools, ...customTools },
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({ stream: result.toUIMessageStream ? result.toUIMessageStream() : result.stream }),
    });
  }
  ```
  Note: the exact response-construction call (`toUIMessageStream` vs.
  `result.toUIMessageStream()`) should be double-checked against the `ai`
  package version actually installed (`web/node_modules/ai/package.json`)
  at implementation time — the cookbook examples referenced when writing
  this plan used `result.textStream`/`streamText`'s own response helper in
  slightly different ways across versions. If `createUIMessageStreamResponse`
  or `toUIMessageStream` aren't exported by the installed version, use
  `result.toUIMessageStreamResponse()` instead (a single method available on
  `streamText`'s return value in several SDK versions) and simplify this
  handler accordingly — either way, the route must return a `Response` that
  `useChat`'s `DefaultChatTransport` can consume.
- [ ] **Step 2: Write a direct route-handler test (no server needed)**
  `web/app/api/chat/route.test.ts`:
  ```typescript
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
  ```
- [ ] **Step 3: Run tests with real env vars**
  Run: `cd web && node --env-file=../.env --import tsx --test app/api/chat/route.test.ts`
  Expected: PASS, 2/2. If the MCP connection genuinely fails (bad URL/token/
  Knowledge Base not ready), the route should still return 200 using custom
  tools only (per the route's `try/catch`) — if the first test fails because
  of this, verify the MCP endpoint is reachable before treating it as a code
  bug (systematic-debugging: check the simplest explanation first).
- [ ] **Step 4: Verify full build**
  Run: `cd web && npm run build`
  Expected: exits 0.
- [ ] **Step 5: Commit**
  ```bash
  git add web/app/api/chat/route.ts web/app/api/chat/route.test.ts
  git commit -m "feat: wire real Sanity Context MCP client and custom tools into chat route"
  ```

---

### Task 6: Chat UI

**Files:**
- Modify: `web/app/page.tsx` (replaces Task 1's placeholder)

**Interfaces:**
- Consumes: `ChatMessage` type from Task 5 (`web/app/api/chat/route.ts`).
- Produces: renders `message.parts`, consumed by Task 7's `ChainTrace`
  integration (which extends this same switch statement).

- [ ] **Step 1: Write the chat page**
  `web/app/page.tsx`:
  ```tsx
  "use client";

  import { useChat } from "@ai-sdk/react";
  import { DefaultChatTransport } from "ai";
  import { useState } from "react";
  import type { ChatMessage } from "./api/chat/route";

  export default function Page() {
    const [input, setInput] = useState("");
    const { messages, sendMessage } = useChat<ChatMessage>({
      transport: new DefaultChatTransport({ api: "/api/chat" }),
    });

    return (
      <main>
        <h1>Money Flow Agent</h1>
        <div>
          {messages.map((message) => (
            <div key={message.id}>
              <strong>{message.role}: </strong>
              {message.parts.map((part, i) => {
                switch (part.type) {
                  case "text":
                    return <span key={`${message.id}-${i}`}>{part.text}</span>;
                  default:
                    return null;
                }
              })}
            </div>
          ))}
        </div>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && input.trim()) {
              sendMessage({ text: input });
              setInput("");
            }
          }}
          placeholder="Ask about a donation's path..."
        />
      </main>
    );
  }
  ```
- [ ] **Step 2: Verify build**
  Run: `cd web && npm run build`
  Expected: exits 0.
- [ ] **Step 3: Manual smoke test**
  Run: `cd web && node --env-file=../.env npx next dev`, open the printed
  localhost URL, ask "What is Silicon Valley Community Foundation?" and
  confirm a text response streams in.
- [ ] **Step 4: Commit**
  ```bash
  git add web/app/page.tsx
  git commit -m "feat: add chat UI with useChat"
  ```

---

### Task 7: Chain trace visualization

**Files:**
- Create: `web/components/ChainTrace.tsx`
- Modify: `web/app/page.tsx:20-24` (the `switch (part.type)` block from Task 6)

**Interfaces:**
- Consumes: `TraceChainResult`/`ChainHop` types from Task 4
  (`web/lib/tools.ts`), and the `tool-traceChain` part shape from Task 5's
  `ChatTools` (`InferUITools<typeof customTools>`).

- [ ] **Step 1: Write the component**
  `web/components/ChainTrace.tsx`:
  ```tsx
  import type { TraceChainResult } from "@/lib/tools";

  export function ChainTrace({ result }: { result: TraceChainResult }) {
    if (result.hops.length === 0) {
      return <p>No further grants found — the chain ends here.</p>;
    }

    return (
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
        <ChainNode name={result.hops[0].funder.name} ein={result.hops[0].funder.ein} />
        {result.hops.map((hop) => (
          <span key={hop.sourceObjectId} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span title={`Source: ${hop.sourceObjectId}`}>
              {" "}
              -- ${hop.amountUsd.toLocaleString()} ({hop.taxYear}) --{" "}
            </span>
            <ChainNode name={hop.recipient.name} ein={hop.recipient.ein} />
          </span>
        ))}
      </div>
    );
  }

  function ChainNode({ name, ein }: { name: string; ein: string }) {
    return (
      <span style={{ border: "1px solid", padding: "0.25rem 0.5rem", borderRadius: "0.25rem" }}>
        {name} ({ein})
      </span>
    );
  }
  ```
- [ ] **Step 2: Wire into the chat page's switch statement**
  Modify `web/app/page.tsx`, adding an import and a case:
  ```tsx
  import { ChainTrace } from "@/components/ChainTrace";
  ```
  Inside the `switch (part.type)` block from Task 6, add before `default`:
  ```tsx
  case "tool-traceChain":
    return part.state === "output-available" ? (
      <ChainTrace key={`${message.id}-${i}`} result={part.output} />
    ) : null;
  ```
- [ ] **Step 3: Verify build**
  Run: `cd web && npm run build`
  Expected: exits 0.
- [ ] **Step 4: Manual smoke test**
  With `next dev` running, ask "If I donate to Silicon Valley Community
  Foundation, how many hops before it reaches a program?" and confirm the
  chain diagram renders alongside the text answer.
- [ ] **Step 5: Commit**
  ```bash
  git add web/components/ChainTrace.tsx web/app/page.tsx
  git commit -m "feat: render traceChain tool results as a chain diagram"
  ```

---

### Task 8: Deploy to Vercel

**Files:** none (infrastructure/config only).

**Interfaces:** none — terminal task.

- [ ] **Step 1: Install Vercel CLI if not present**
  Run: `npx vercel --version`
- [ ] **Step 2: Link and deploy**
  Run (from `web/`): `npx vercel` — follow prompts to link/create a Vercel
  project with root directory `web/`.
- [ ] **Step 3: Set environment variables in Vercel**
  In the Vercel project's dashboard (Settings → Environment Variables), add:
  `SANITY_PROJECT_ID`, `SANITY_DATASET`, `SANITY_ORG_ID`,
  `SANITY_CONTEXT_TOKEN`, `SANITY_READ_TOKEN`, `GOOGLE_GENERATIVE_AI_API_KEY`
  — same values as the local `.env` (Vercel does not read repo `.env`
  files). **`SANITY_READ_TOKEN` was added by a Task 3 ruling after this
  plan was written — `web/lib/sanity-client.ts` requires it; without it,
  every `/api/chat` request fails.**
- [ ] **Step 4: Deploy to production**
  Run: `npx vercel --prod`
  Expected: prints a live `https://*.vercel.app` URL.
- [ ] **Step 5: Verify live**
  Open the deployed URL, ask the flagship question, confirm it responds with
  a cited answer and chain diagram.
