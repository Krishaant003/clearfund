# Context MCP Primary Path + purposeCategory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Sanity Context MCP endpoint the agent's primary, visible data path, then add a Gemini-classified `purposeCategory` field on grants.

**Architecture:** `web/app/api/chat/route.ts` requires the MCP connection (explicit error instead of silent fallback) and prompts the model to use MCP tools first. A pure helper lists tool calls made so the UI can show a "Sources" strip. A one-off script classifies the 64 seeded grants and writes `purposeCategory` to Sanity; the field is shown as a table column.

**Tech Stack:** Next.js (web/), Vercel AI SDK (`ai`, `@ai-sdk/mcp`, `@ai-sdk/google`), `@sanity/client`, Sanity Studio schema, `node:test` via `tsx`.

**Spec:** `docs/superpowers/specs/2026-10-04-context-mcp-primary-design.md`

## Global Constraints

- Model stays `gemini-3.1-flash-lite`. Do not change models.
- Do not edit `README.md`. Do not deploy (the user deploys last).
- Commits: author is the repo's git user; no Claude co-author trailer (standing instruction in this repo's ledger).
- Run TypeScript checks with the Windows Node: `"/mnt/c/Program Files/nodejs/node.exe" node_modules/typescript/lib/tsc.js --noEmit` from `web/` (Linux `tsc` fails: `node_modules` was installed on Windows).
- `.env` has Windows line endings: strip `\r` when reading values in shell. `node --env-file` handles them.
- Gemini free quota is tight: live tests are marked **(LIVE)**; run each at most once, and stop and report if a quota error appears.
- `traceChain` and any kept custom tools read via `@sanity/client` (`SANITY_READ_TOKEN`); that is a known direct-dataset read and must be stated, not hidden.
- `purposeSectorMismatch` is out of scope (dropped). Part C (structured vs flat comparison) is out of scope (declined).

## Review Focus

- MCP endpoint unreachable or token invalid: expect an explicit JSON error with a non-200 status, never a silent custom-tools-only answer (Task 1 test).
- Model answers without calling any MCP tool: the live test must fail, not pass (Task 2).
- MCP tool parts arrive under a type name the UI doesn't recognise: Sources strip must still list them, not drop them (Task 3 test).
- Gemini returns a category outside the enum, or fewer/more results than grants sent: script must reject and not write (Task 4 test).
- Re-running the classifier after a partial failure: already-classified grants are skipped (Task 4 test).

---

### Task 1: Require the MCP connection and steer the prompt to it

**Files:**
- Modify: `web/app/api/chat/route.ts`
- Modify: `web/app/api/chat/route.test.ts` (replace the bad-token test)

**Interfaces:**
- Produces: `POST` returns `Response.json({ error: string }, { status: 502 })` when the MCP connection or `tools()` call fails; otherwise unchanged streaming response.

- [ ] **Step 1: Replace the fallback test with a failing test**

In `route.test.ts`, replace the test named `POST still answers via custom tools when the MCP connection fails (bad token)` with:

```ts
test("POST returns an explicit 502 error when the Context MCP connection fails (no silent fallback)", async () => {
  const originalToken = process.env.SANITY_CONTEXT_TOKEN;
  process.env.SANITY_CONTEXT_TOKEN = "not-a-real-token";
  try {
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "Who did SVCF fund?" }] }],
      }),
    });
    const response = await POST(request);
    assert.equal(response.status, 502);
    const json = await response.json();
    assert.match(json.error, /Context/i);
  } finally {
    if (originalToken) process.env.SANITY_CONTEXT_TOKEN = originalToken;
  }
});
```

This test makes no Gemini call (it fails before the model runs).

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd web && node --env-file=../.env --import tsx --test --test-name-pattern="explicit 502" app/api/chat/route.test.ts`
Expected: FAIL (status is 200 today).

- [ ] **Step 3: Implement**

In `route.ts`, replace the `try { ... } catch { console.error(...) }` block with:

```ts
  let mcpClient: MCPClient;
  let mcpTools: ToolSet;
  try {
    mcpClient = await createMCPClient({
      transport: {
        type: "http",
        url: mcpUrl,
        headers: { Authorization: `Bearer ${contextToken}` },
      },
    });
    mcpTools = await mcpClient.tools();
  } catch (error) {
    console.error("Sanity Context MCP connection failed:", error);
    return Response.json(
      { error: "Could not reach the Sanity Context MCP endpoint, so the agent can't read the Knowledge Base." },
      { status: 502 }
    );
  }
```

Change `const closeMcpClient = () => mcpClient?.close();` to `const closeMcpClient = () => mcpClient.close();`.

Replace the `system` string with:

```ts
    system:
      "You trace US community foundation grants through re-granting intermediaries. " +
      "Answer by querying the Sanity Context Knowledge Base through the MCP tools first, and base your answer on what they return. " +
      "Use traceChain only for multi-hop questions (how many hops a donation takes before reaching a program). " +
      "Cite the sourceObjectId for every grant claim you make.",
```

- [ ] **Step 4: Run the test and typecheck**

Run the Step 2 command: expected PASS. Then run the typecheck (see Global Constraints): expected no output.

- [ ] **Step 5: Commit**

```bash
git add web/app/api/chat/route.ts web/app/api/chat/route.test.ts
git commit -m "feat: require the Context MCP connection and prompt the agent to use it first"
```

---

### Task 2: Prove Context is used, then decide on the duplicate custom tools

**Files:**
- Modify: `web/app/api/chat/route.test.ts`
- Maybe modify: `web/lib/tools.ts`, `web/lib/tools.test.ts`, `web/app/page.tsx`, `web/app/api/chat/route.ts` (only per Step 4 outcome)

**Interfaces:**
- Consumes: Task 1's `POST`.

- [ ] **Step 1: Write the live test (LIVE)**

Add to `route.test.ts`:

```ts
const CUSTOM_TOOLS = new Set(["traceChain", "getGrantsByFunder", "getGrantsByRecipient", "findIntermediaries"]);

test("(LIVE) a grants question makes at least one Context MCP tool call", async () => {
  const request = new Request("http://localhost/api/chat", {
    method: "POST",
    body: JSON.stringify({
      messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "Which organizations did Silicon Valley Community Foundation give grants to?" }] }],
    }),
  });
  const response = await POST(request);
  assert.equal(response.status, 200);
  const body = await response.text();
  const toolNames = [...body.matchAll(/"toolName":"([^"]+)"/g)].map((m) => m[1]);
  const mcpCalls = toolNames.filter((n) => !CUSTOM_TOOLS.has(n));
  assert.ok(mcpCalls.length > 0, `expected an MCP tool call, got only: ${[...new Set(toolNames)].join(", ") || "none"}`);
});
```

- [ ] **Step 2: Run it once (LIVE)**

Run: `cd web && node --env-file=../.env --import tsx --test --test-name-pattern="LIVE" app/api/chat/route.test.ts`
Record the result and the tool names in the ledger (`.superpowers/sdd/2026-10-04-context-mcp-primary-plan/progress.md`).

- [ ] **Step 3: If it fails, force MCP use**

If the model skipped MCP, remove `getGrantsByFunder`, `getGrantsByRecipient` and `findIntermediaries` from the `tools` export in `web/lib/tools.ts` (keep `traceChain`), delete their cases in `web/app/page.tsx` (`collectGrants` branches and the `tool-getGrantsBy*` / `tool-findIntermediaries` render cases), delete their tests in `web/lib/tools.test.ts`, then re-run Step 2. If it still fails, stop and report to the user; do not weaken the test.

- [ ] **Step 4: If it passes, check MCP covers the lookups before removing anything**

Ask the live agent (one request each, LIVE) "Which grants did SVCF make in 2023?" and "Which organizations both receive and re-grant money?" and check the answers against the Sanity data (query with `@sanity/client` or the Sanity MCP `query_documents`). Only if both are correct, remove the three duplicate tools exactly as in Step 3. Otherwise keep them and record that in the ledger and README-bound notes for the write-up (do not edit README).

- [ ] **Step 5: Typecheck, run `npm test` in `web/`, commit**

```bash
git add -A web
git commit -m "test: assert the agent makes Context MCP calls; trim duplicate tools if MCP covers them"
```

---

### Task 3: "Sources" strip showing the tool calls behind an answer

**Files:**
- Create: `web/lib/sources.ts`
- Create: `web/lib/sources.test.ts`
- Create: `web/components/SourcesStrip.tsx`
- Modify: `web/app/page.tsx`, `web/app/globals.css`

**Interfaces:**
- Produces: `listSources(parts: { type: string; toolName?: string; state?: string }[]): { name: string; via: "Sanity Context MCP" | "Direct GROQ" }[]` — unique tool calls that reached an output, in order. Custom tool names: `traceChain`, `getGrantsByFunder`, `getGrantsByRecipient`, `findIntermediaries`.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { listSources } from "./sources.ts";

test("listSources labels MCP dynamic tools and custom tools, deduplicated", () => {
  const out = listSources([
    { type: "text" },
    { type: "dynamic-tool", toolName: "knowledge_base_read", state: "output-available" },
    { type: "dynamic-tool", toolName: "knowledge_base_read", state: "output-available" },
    { type: "tool-traceChain", state: "output-available" },
    { type: "dynamic-tool", toolName: "pending_one", state: "input-available" },
  ]);
  assert.deepEqual(out, [
    { name: "knowledge_base_read", via: "Sanity Context MCP" },
    { name: "traceChain", via: "Direct GROQ" },
  ]);
});
```

- [ ] **Step 2: Run, expect FAIL** (`cd web && node --import tsx --test lib/sources.test.ts`; module not found).

- [ ] **Step 3: Implement**

```ts
const CUSTOM = new Set(["traceChain", "getGrantsByFunder", "getGrantsByRecipient", "findIntermediaries"]);

export function listSources(parts: { type: string; toolName?: string; state?: string }[]) {
  const seen = new Set<string>();
  const out: { name: string; via: "Sanity Context MCP" | "Direct GROQ" }[] = [];
  for (const p of parts) {
    if (p.state !== "output-available") continue;
    const name = p.type === "dynamic-tool" ? p.toolName : p.type.startsWith("tool-") ? p.type.slice(5) : undefined;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, via: CUSTOM.has(name) ? "Direct GROQ" : "Sanity Context MCP" });
  }
  return out;
}
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Verify the real part shape**

Run the dev server (Windows Node: `"/mnt/c/Program Files/nodejs/node.exe" node_modules/next/dist/bin/next dev`; if one is already running at localhost:3000, use it, reachable from WSL at the default-route IP) and capture one `/api/chat` stream. Confirm MCP tool parts really use `dynamic-tool` with `toolName`; if the type differs, fix `listSources` and its test to match the captured shape.

- [ ] **Step 6: Render the strip**

`components/SourcesStrip.tsx`:

```tsx
import { listSources } from "@/lib/sources";

export function SourcesStrip({ parts }: { parts: Parameters<typeof listSources>[0] }) {
  const sources = listSources(parts);
  if (sources.length === 0) return null;
  return (
    <p className="sources" aria-label="Data sources used">
      Looked up with{" "}
      {sources.map((s, i) => (
        <span key={s.name} className={s.via === "Sanity Context MCP" ? "src-mcp" : "src-groq"}>
          {i > 0 ? ", " : ""}{s.name} ({s.via})
        </span>
      ))}
    </p>
  );
}
```

In `page.tsx`, render `<SourcesStrip parts={message.parts as never} />` after the parts map inside each assistant `<article>` (only when `message.role === "assistant"`). Add to `globals.css`: `.sources { font-size: 0.85rem; color: var(--muted); margin: 0; } .src-mcp { color: var(--end); font-weight: 600; }`.

- [ ] **Step 7: Typecheck, build, commit**

```bash
git add web/lib/sources.ts web/lib/sources.test.ts web/components/SourcesStrip.tsx web/app/page.tsx web/app/globals.css
git commit -m "feat: show which tools (Context MCP vs direct GROQ) produced each answer"
```

---

### Task 4: `purposeCategory` field and classification script (Part B, optional)

Do this task only after Tasks 1-3 are done and the user confirms they want Part B.

**Files:**
- Modify: `sanity/schemas/grant.ts`
- Create: `scripts/classify-purposes.ts`, `scripts/classify-purposes.test.ts`

**Interfaces:**
- Produces: `PURPOSE_CATEGORIES` (readonly tuple: `capacity_building`, `direct_service`, `capital_facilities`, `research`, `general_operating`, `other`); `batchGrants<T>(items: T[], size: number): T[][]`; `validateBatch(ids: string[], result: { id: string; category: string }[]): { id: string; category: PurposeCategory }[]` (throws on unknown category, missing id, extra id).

- [ ] **Step 1: Schema field**

Add to `grant.ts` fields:

```ts
    defineField({
      name: "purposeCategory",
      title: "Purpose Category",
      type: "string",
      options: { list: ["capacity_building", "direct_service", "capital_facilities", "research", "general_operating", "other"] },
      description: "Derived from grantPurpose by scripts/classify-purposes.ts (Gemini). Not in the source IRS data.",
    }),
```

- [ ] **Step 2: Failing tests for the pure helpers**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { batchGrants, validateBatch } from "./classify-purposes.ts";

test("batchGrants splits into chunks of the given size", () => {
  assert.deepEqual(batchGrants([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});
test("validateBatch accepts a complete, valid result", () => {
  assert.deepEqual(validateBatch(["a", "b"], [{ id: "a", category: "research" }, { id: "b", category: "other" }]),
    [{ id: "a", category: "research" }, { id: "b", category: "other" }]);
});
test("validateBatch rejects an unknown category", () => {
  assert.throws(() => validateBatch(["a"], [{ id: "a", category: "arts" }]), /category/);
});
test("validateBatch rejects missing or extra ids", () => {
  assert.throws(() => validateBatch(["a", "b"], [{ id: "a", category: "other" }]), /missing/);
  assert.throws(() => validateBatch(["a"], [{ id: "a", category: "other" }, { id: "z", category: "other" }]), /unexpected/);
});
```

- [ ] **Step 3: Run, expect FAIL** (`node --import tsx --test scripts/classify-purposes.test.ts`).

- [ ] **Step 4: Implement the script**

`classify-purposes.ts` exports the helpers above and a `main()` guarded by `if (process.argv[1]?.endsWith("classify-purposes.ts"))`. `main()`:
1. Reads `SANITY_PROJECT_ID`, `SANITY_DATASET`, `SANITY_WRITE_TOKEN`, `GOOGLE_GENERATIVE_AI_API_KEY` (`requireEnv`, as in `route.ts`).
2. Queries `*[_type=="grant" && !defined(purposeCategory)]{_id, grantPurpose}` via `@sanity/client`.
3. For each batch of 15, calls `generateObject` (from `ai`, with `@ai-sdk/google`, model `gemini-3.1-flash-lite`) with a zod schema `z.object({ results: z.array(z.object({ id: z.string(), category: z.enum(PURPOSE_CATEGORIES) })) })`, prompt listing `id: purpose` lines and the category definitions, then `validateBatch`.
4. With `--dry-run` prints `id, purpose, category` rows and writes nothing; otherwise patches each doc with `client.patch(id).set({ purposeCategory }).commit()`.
5. Waits 8 seconds between batches. On any error, stops and prints how many were written (re-running skips classified grants).

Add `ai`, `@ai-sdk/google`, `zod` to the repo-root `package.json` only if the root can't resolve them (check `ls node_modules`); otherwise reuse them.

- [ ] **Step 5: Run tests, expect PASS; typecheck the script.**

- [ ] **Step 6: Dry run (LIVE, ~5 Gemini calls) and spot-check**

Run: `node --env-file=.env --import tsx scripts/classify-purposes.ts --dry-run`
Show the user the table and have them confirm at least 10 rows by eye (include the long Duke and JPMC examples). Fix the prompt if labels are wrong. Writing to the production dataset needs the user's explicit yes first.

- [ ] **Step 7: Write for real, deploy schema, verify**

After the user's yes: run without `--dry-run`. The Studio schema must also be deployed for the field to show in the Studio (`cd sanity && npx sanity schema deploy`); ask the user first, since that touches the shared project. Then confirm the Context MCP endpoint returns the field by asking the agent "What is the purposeCategory of the grant to Navigation Charitable Fund?" (LIVE, once). If MCP doesn't expose it, report that and stop; don't work around it.

- [ ] **Step 8: Show it in the table**

Add `purposeCategory` to the tool queries in `web/lib/tools.ts` and `GrantByFunderSummary`/`GrantByRecipientSummary`/`GrantRow`, and a "Type" column in `web/components/GrantList.tsx` (render `r.purposeCategory?.replace(/_/g, " ") ?? "—"`). Typecheck, run `lib/tools.test.ts`, commit:

```bash
git add sanity/schemas/grant.ts scripts web
git commit -m "feat: classify grant purposes into purposeCategory and show it in the grant table"
```

---

## Self-Review

- Spec Part A items 1-6 → Tasks 1 (prompt, no fallback), 2 (tool set, test), 3 (visible proof). Item 6 (write-up honesty) → Global Constraints plus the Task 2 Step 4 note; the README itself is intentionally untouched.
- Spec Part B → Task 4. The mismatch flag and Part C are excluded by constraint.
- Names are consistent: `listSources`, `PURPOSE_CATEGORIES`, `batchGrants`, `validateBatch`, `purposeCategory`.
