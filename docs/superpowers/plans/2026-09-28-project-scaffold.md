# Money Flow Agent — Project Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Stand up the local project skeleton — TypeScript tooling, Sanity
schema files, agent config/env wiring, a minimal Gemini-calling agent stub,
and a working DuckDB seed script against the public funder-graph dataset —
so the project is ready for the manual Sanity account/token setup and the
real agent-logic build that follow.

**Architecture:** A single Node/TypeScript project with three areas: `sanity/`
(Studio config + schema, no separate CMS repo), `agent/` (Gemini + Vercel AI
SDK wiring, MCP client to be added once a deployed Studio + org token exist),
and `scripts/` (DuckDB seed queries against the public parquet dataset, no
auth required).

**Tech Stack:** Node (v25 installed locally), TypeScript, `tsx` for running
TS directly, Vercel AI SDK (`ai` + `@ai-sdk/google`), `sanity` (schema types),
`duckdb` (Node bindings, for querying remote parquet over `httpfs`).

**Spec:** `spec.md` (repo root) — this plan implements sections 2 (data
source), 4 (Sanity schema), and 6 (agent architecture, minus the MCP client
itself, which needs a deployed Studio and org-level token that don't exist
yet).

## Amendment (2026-09-28): spec §11 added — stretch, not in scope here

Spec added Section 11: an **optional stretch** feature (LLM-classify
`grant_purpose` into a `purposeCategory` taxonomy field, plus a derived
`purposeSectorMismatch` boolean comparing stated purpose vs. recipient
`nteeCode`). The spec itself says: "optional, additive, do not let it delay
the core build" and "build this only after Sections 1-10 are working
end-to-end." Ruling: no changes to Tasks 1-6 of this plan — none of them
touch `grant_purpose` or classification, and the full end-to-end agent
(MCP-connected, seeded) this stretch depends on doesn't exist yet regardless.
Tracked as a **future, separate plan** once the full agent works — not a
task added to this scaffold plan. One reference line added to Task 6's
README content (below) so it's discoverable at handover. Cost if wrong:
none — this defers work that spec explicitly says to defer.

## Global Constraints

- ONE `organization` document type, not separate funder/recipient types —
  role is derived from `grant` references, not the org's own type (spec §4).
- Filter to `match_tier` A or B only when seeding (spec §2).
- `amount_type` is `paid` or `approved_future` — never sum both; default to
  `paid` (spec §2).
- Exclude `VARIOUS ORGANIZATIONS` aggregate-placeholder recipient rows (spec
  §2).
- No separate `filing` document type (spec §4).
- Stack is TypeScript/Node, Vercel AI SDK, Gemini 3.5 Flash Lite via
  `@ai-sdk/google` (spec §6).
- Sanity Context requires a **deployed** Studio and an **organization-level**
  API token with Context Viewer permission — a project-level token will not
  work (spec §6).
- MCP endpoint URL pattern: `https://api.sanity.io/v1/context/organizations/<ORG_ID>/mcp/<name>`
  (spec §6).

## Review Focus

- **Missing/invalid env vars at startup** — the agent should fail fast with a
  named list of what's missing, not a cryptic downstream error. Pinned by
  Task 3's config tests.
- **Confusing project-level vs. org-level Sanity token** — spec explicitly
  flags this as easy to get wrong. Pinned by Task 4's `.env.example` comments
  and Task 6's README.
- **Wrong MCP endpoint URL shape** — pinned by Task 3's `contextMcpUrl()`
  helper, which hardcodes the exact pattern from spec §6 instead of letting
  callers assemble it by hand.
- **Schema field-name drift from spec** — pinned by Task 2 using the spec's
  schema code verbatim rather than paraphrasing it.
- **Rate-limit/429 handling** — spec §7 says implement backoff "from the
  start," but there is no live MCP-calling loop yet in this scaffold (that
  requires a deployed Studio + org token, which are manual, out-of-repo
  steps). Explicitly flagged as a known gap in Task 6's README rather than
  faked with no real call to back it.

---

### Task 1: Node/TypeScript project tooling

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`

**Interfaces:**
- Produces: npm scripts `build`, `dev`, `seed`, `test` that later tasks rely on.

- [ ] **Step 1: Initialize package.json**
  Run: `npm init -y`
- [ ] **Step 2: Install base tooling**
  Run: `npm install -D typescript tsx @types/node`
- [ ] **Step 3: Set package.json fields**
  Edit `package.json` to set `"type": "module"` and add scripts:
  ```json
  "scripts": {
    "build": "tsc --noEmit",
    "dev": "tsx agent/index.ts",
    "seed": "tsx scripts/seed.ts",
    "test": "node --import tsx --test agent/*.test.ts"
  }
  ```
- [ ] **Step 4: Write tsconfig.json**
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "NodeNext",
      "moduleResolution": "NodeNext",
      "strict": true,
      "esModuleInterop": true,
      "skipLibCheck": true,
      "noEmit": true
    },
    "include": ["agent", "sanity", "scripts"]
  }
  ```
- [ ] **Step 5: Write .gitignore**
  ```
  node_modules/
  .env
  dist/
  ```
- [ ] **Step 6: Verify tooling installed**
  Run: `npx tsc --version && npx tsx --version`
  Expected: both print a version number, no errors.
- [ ] **Step 7: Commit**
  ```bash
  git add package.json package-lock.json tsconfig.json .gitignore
  git commit -m "chore: initialize Node/TypeScript project tooling"
  ```

---

### Task 2: Sanity schema scaffold

**Files:**
- Create: `sanity/schemas/organization.ts`
- Create: `sanity/schemas/grant.ts`
- Create: `sanity/schemas/index.ts`
- Create: `sanity/sanity.config.ts`

**Interfaces:**
- Consumes: `tsconfig.json` include paths from Task 1.
- Produces: `schemaTypes` array (from `sanity/schemas/index.ts`) that a
  deployed Studio config will consume later.

- [ ] **Step 1: Install sanity package for schema types**
  Run: `npm install sanity`
- [ ] **Step 2: Write organization schema (verbatim from spec §4)**
  `sanity/schemas/organization.ts`:
  ```typescript
  import { defineField, defineType } from "sanity";

  export default defineType({
    name: "organization",
    title: "Organization",
    type: "document",
    fields: [
      defineField({
        name: "ein",
        title: "EIN",
        type: "string",
        validation: (Rule) => Rule.required(),
      }),
      defineField({
        name: "name",
        title: "Name",
        type: "string",
        validation: (Rule) => Rule.required(),
      }),
      defineField({ name: "state", title: "State", type: "string" }),
      defineField({
        name: "nteeCode",
        title: "NTEE Code",
        type: "string",
        description:
          "Sector classification, e.g. T31 = Foundations & Grantmakers",
      }),
      defineField({
        name: "subsectionCode",
        title: "IRC Subsection",
        type: "string",
        description: "e.g. 501(c)(3)",
      }),
    ],
  });
  ```
- [ ] **Step 3: Write grant schema (verbatim from spec §4)**
  `sanity/schemas/grant.ts`:
  ```typescript
  import { defineField, defineType } from "sanity";

  export default defineType({
    name: "grant",
    title: "Grant",
    type: "document",
    fields: [
      defineField({
        name: "funder",
        title: "Funder",
        type: "reference",
        to: [{ type: "organization" }],
        validation: (Rule) => Rule.required(),
      }),
      defineField({
        name: "recipient",
        title: "Recipient",
        type: "reference",
        to: [{ type: "organization" }],
        validation: (Rule) => Rule.required(),
      }),
      defineField({ name: "amountUsd", title: "Amount (USD)", type: "number" }),
      defineField({
        name: "amountType",
        title: "Amount Type",
        type: "string",
        options: { list: ["paid", "approved_future"] },
        description: "Never sum both types together — see dataset docs.",
      }),
      defineField({ name: "taxYear", title: "Tax Year", type: "number" }),
      defineField({ name: "grantPurpose", title: "Grant Purpose", type: "text" }),
      defineField({
        name: "matchConfidence",
        title: "Match Confidence",
        type: "number",
        description:
          "0.0-1.0, from source dataset. Only tier A/B rows should be seeded.",
      }),
      defineField({
        name: "matchTier",
        title: "Match Tier",
        type: "string",
        options: { list: ["A", "B", "C", "D", "U"] },
      }),
      defineField({
        name: "sourceObjectId",
        title: "Source Filing Object ID",
        type: "string",
        description:
          "IRS OBJECT_ID of the source filing — provenance/citation key.",
      }),
    ],
  });
  ```
- [ ] **Step 4: Write schema index**
  `sanity/schemas/index.ts`:
  ```typescript
  import organization from "./organization";
  import grant from "./grant";

  export const schemaTypes = [organization, grant];
  ```
- [ ] **Step 5: Write Studio config**
  `sanity/sanity.config.ts`:
  ```typescript
  import { defineConfig } from "sanity";
  import { structureTool } from "sanity/structure";
  import { schemaTypes } from "./schemas";

  export default defineConfig({
    name: "default",
    title: "Money Flow Agent",
    projectId: process.env.SANITY_STUDIO_PROJECT_ID ?? "",
    dataset: process.env.SANITY_STUDIO_DATASET ?? "production",
    plugins: [structureTool()],
    schema: {
      types: schemaTypes,
    },
  });
  ```
- [ ] **Step 6: Verify compiles**
  Run: `npm run build`
  Expected: exits 0, no TypeScript errors.
- [ ] **Step 7: Commit**
  ```bash
  git add package.json package-lock.json sanity/
  git commit -m "feat: add Sanity organization/grant schema scaffold"
  ```

---

### Task 3: Agent config module (with tests)

**Files:**
- Create: `agent/config.ts`
- Test: `agent/config.test.ts`

**Interfaces:**
- Produces: `loadConfig(): AgentConfig` and `contextMcpUrl(config): string`,
  used by Task 4's agent stub and by future MCP-wiring work.

- [ ] **Step 1: Write failing test**
  `agent/config.test.ts`:
  ```typescript
  import { test } from "node:test";
  import assert from "node:assert/strict";
  import { loadConfig, contextMcpUrl } from "./config.ts";

  const REQUIRED_KEYS = [
    "SANITY_PROJECT_ID",
    "SANITY_DATASET",
    "SANITY_ORG_ID",
    "SANITY_CONTEXT_TOKEN",
    "GOOGLE_GENERATIVE_AI_API_KEY",
  ];

  function withEnv(vars: Record<string, string>, fn: () => void) {
    const saved: Record<string, string | undefined> = {};
    for (const key of REQUIRED_KEYS) saved[key] = process.env[key];
    for (const key of REQUIRED_KEYS) delete process.env[key];
    Object.assign(process.env, vars);
    try {
      fn();
    } finally {
      for (const key of REQUIRED_KEYS) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    }
  }

  test("throws a named error when a required env var is missing", () => {
    withEnv({}, () => {
      assert.throws(() => loadConfig(), /Missing required environment variable: SANITY_PROJECT_ID/);
    });
  });

  test("returns a config object when all required env vars are set", () => {
    withEnv(
      {
        SANITY_PROJECT_ID: "test-project",
        SANITY_DATASET: "production",
        SANITY_ORG_ID: "test-org",
        SANITY_CONTEXT_TOKEN: "test-token",
        GOOGLE_GENERATIVE_AI_API_KEY: "test-key",
      },
      () => {
        const config = loadConfig();
        assert.equal(config.sanityProjectId, "test-project");
        assert.equal(config.googleApiKey, "test-key");
      }
    );
  });

  test("contextMcpUrl matches the spec's org-level endpoint pattern", () => {
    withEnv(
      {
        SANITY_PROJECT_ID: "test-project",
        SANITY_DATASET: "production",
        SANITY_ORG_ID: "test-org",
        SANITY_CONTEXT_TOKEN: "test-token",
        GOOGLE_GENERATIVE_AI_API_KEY: "test-key",
      },
      () => {
        const config = loadConfig();
        assert.equal(
          contextMcpUrl(config),
          "https://api.sanity.io/v1/context/organizations/test-org/mcp/money-flow-agent"
        );
      }
    );
  });
  ```
- [ ] **Step 2: Run test, verify it fails**
  Run: `npx tsx --test agent/config.test.ts`
  Expected: FAIL — `agent/config.ts` does not exist yet.
- [ ] **Step 3: Write minimal implementation**
  `agent/config.ts`:
  ```typescript
  export interface AgentConfig {
    sanityProjectId: string;
    sanityDataset: string;
    sanityOrgId: string;
    sanityContextToken: string;
    googleApiKey: string;
  }

  const REQUIRED_ENV_VARS = [
    "SANITY_PROJECT_ID",
    "SANITY_DATASET",
    "SANITY_ORG_ID",
    "SANITY_CONTEXT_TOKEN",
    "GOOGLE_GENERATIVE_AI_API_KEY",
  ] as const;

  export function loadConfig(): AgentConfig {
    for (const key of REQUIRED_ENV_VARS) {
      if (!process.env[key]) {
        throw new Error(`Missing required environment variable: ${key}`);
      }
    }

    return {
      sanityProjectId: process.env.SANITY_PROJECT_ID!,
      sanityDataset: process.env.SANITY_DATASET!,
      sanityOrgId: process.env.SANITY_ORG_ID!,
      sanityContextToken: process.env.SANITY_CONTEXT_TOKEN!,
      googleApiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY!,
    };
  }

  export function contextMcpUrl(config: AgentConfig): string {
    return `https://api.sanity.io/v1/context/organizations/${config.sanityOrgId}/mcp/money-flow-agent`;
  }
  ```
- [ ] **Step 4: Run test, verify it passes**
  Run: `npx tsx --test agent/config.test.ts`
  Expected: PASS, 3/3 tests.
- [ ] **Step 5: Commit**
  ```bash
  git add agent/config.ts agent/config.test.ts
  git commit -m "feat: add agent config loader with fail-fast env validation"
  ```

---

### Task 4: Env template + minimal Gemini agent stub

**Files:**
- Create: `.env.example`
- Create: `agent/index.ts`

**Interfaces:**
- Consumes: `loadConfig()` from Task 3.

- [ ] **Step 1: Install Vercel AI SDK + Google provider**
  Run: `npm install ai @ai-sdk/google`
- [ ] **Step 2: Write .env.example**
  ```
  # Sanity project (from sanity.io/manage) — project-level, safe to share within team
  SANITY_PROJECT_ID=
  SANITY_DATASET=production

  # Sanity Context requires an ORGANIZATION-level API token with "Context Viewer"
  # permission. A project-level token will NOT work here — create it under your
  # organization settings, not your project settings.
  SANITY_ORG_ID=
  SANITY_CONTEXT_TOKEN=

  # Get from aistudio.google.com/apikey
  GOOGLE_GENERATIVE_AI_API_KEY=
  ```
- [ ] **Step 3: Write agent stub**
  `agent/index.ts`:
  ```typescript
  import { generateText } from "ai";
  import { google } from "@ai-sdk/google";
  import { loadConfig } from "./config.ts";

  async function main() {
    loadConfig(); // fails fast if required env vars are missing

    const prompt = process.argv.slice(2).join(" ") || "Say hello in one sentence.";

    const { text } = await generateText({
      model: google("gemini-3.5-flash-lite"),
      prompt,
    });

    console.log(text);
  }

  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
  ```
- [ ] **Step 4: Verify compiles**
  Run: `npm run build`
  Expected: exits 0, no TypeScript errors.
- [ ] **Step 5: Commit**
  ```bash
  git add package.json package-lock.json .env.example agent/index.ts
  git commit -m "feat: add minimal Gemini agent stub and env template"
  ```

---

### Task 5: DuckDB seed script (end-to-end against public data)

**Files:**
- Create: `scripts/seed.ts`

**Interfaces:**
- None consumed from earlier tasks — reads directly from the public
  funder-graph parquet dataset (spec §2), no auth required.

> **Amended during execution:** classic `duckdb` (node-gyp) has no
> prebuilt binary for Node v25.9.0 and fell back to a from-source compile
> that was still running after ~30 min. Switched to `@duckdb/node-api`
> (DuckDB "Node Neo", N-API based — ABI-stable prebuilds across Node
> versions, human partner's call). See ledger Task 5 entry for the full
> ruling. Steps below reflect what was actually built.

- [x] **Step 1: Install DuckDB Node bindings**
  Run: `npm install @duckdb/node-api`
- [x] **Step 2: Write seed script (query logic verbatim from spec §2)**
  `scripts/seed.ts`:
  ```typescript
  import { DuckDBInstance } from "@duckdb/node-api";

  const YEARS = [2023, 2024];
  const parquetUrls = YEARS.map(
    (year) =>
      `https://data.opengrants.io/funder-graph/2026.09.0/grants/filing_year=${year}/part-0000.parquet`
  );

  async function main() {
    const instance = await DuckDBInstance.create(":memory:");
    const connection = await instance.connect();

    await connection.run("INSTALL httpfs");
    await connection.run("LOAD httpfs");

    const query = `
      SELECT funder_ein, funder_name, recipient_name_raw, recipient_ein_resolved,
             recipient_state, amount_usd, tax_year, grant_purpose,
             match_confidence, match_tier, object_id
      FROM read_parquet(
        [${parquetUrls.map((url) => `'${url}'`).join(", ")}],
        hive_partitioning = 1
      )
      WHERE funder_ein = '205205488'
        AND amount_type = 'paid'
        AND match_tier IN ('A', 'B')
      ORDER BY amount_usd DESC
      LIMIT 50;
    `;

    const reader = await connection.runAndReadAll(query);
    const rows = reader.getRowObjects();

    console.log(`Fetched ${rows.length} rows for Silicon Valley Community Foundation`);
    console.table(rows.slice(0, 5));
  }

  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
  ```
- [x] **Step 3: Run it for real**
  Run: `npm run seed`
  Expected: prints `Fetched N rows for Silicon Valley Community Foundation`
  with N > 0, followed by a table of the first 5 rows.
  Actual: `Fetched 50 rows for Silicon Valley Community Foundation`, real
  data (real recipient EINs, tier A/B only). Matched.
- [x] **Step 4: Commit** (commit `18b6a16`)
  ```bash
  git add package.json package-lock.json scripts/seed.ts
  git commit -m "feat: add DuckDB seed script against public funder-graph dataset"
  ```

---

### Task 6: README for manual setup steps

**Files:**
- Create: `README.md`

**Interfaces:**
- None — documentation only.

- [ ] **Step 1: Write README**
  `README.md`:
  ```markdown
  # Money Flow Agent

  Traces US community foundation grants through re-granting intermediaries
  to answer "how many hops does a donated dollar take before it reaches a
  program-delivering org?" Built for the dev.to Sanity Challenge, Path One.
  See `spec.md` for the full design.

  ## Local setup

  ```bash
  npm install
  cp .env.example .env
  ```

  Fill in `.env`:
  - `SANITY_PROJECT_ID`, `SANITY_DATASET` — from an existing or new Sanity
    project (sanity.io/manage).
  - `SANITY_ORG_ID`, `SANITY_CONTEXT_TOKEN` — Sanity Context requires an
    **organization-level** API token with Context Viewer permission. A
    project-level token will not work.
  - `GOOGLE_GENERATIVE_AI_API_KEY` — from aistudio.google.com/apikey.

  ## Manual steps not covered by this scaffold

  These require an authenticated Sanity/Google account and are not
  automated here:

  1. `npx sanity login`, then `npx sanity init` inside `sanity/` to connect
     this schema to a real Sanity project, and deploy the Studio
     (`npx sanity deploy`) — Sanity Context requires a **deployed** Studio.
  2. Create the organization-level Context Viewer token (see above) and the
     Knowledge Base in Sanity's dashboard.
  3. Run `npx skills add sanity-io/context --all`, then prompt the coding
     agent to use the `create-agent-with-sanity-context` skill — this
     scaffolds the actual MCP client, which this repo doesn't have yet.
  4. Seed real data: adapt `scripts/seed.ts` to write the queried rows into
     Sanity as `organization`/`grant` documents (see spec §3 for the target
     seed set).

  ## Known gaps

  - No MCP client yet (needs step 3 above).
  - No rate-limit backoff yet — spec §7 requires this before the agent makes
    live MCP/Gemini calls in a loop; add it alongside the MCP client.

  ## Future work (optional stretch)

  - Spec §11: classify `grant_purpose` into a `purposeCategory` taxonomy and
    derive a `purposeSectorMismatch` flag against recipient `nteeCode`.
    Explicitly optional and deferred — the spec says build it only after
    the full agent (MCP-connected, seeded) is working end-to-end, not as
    part of this scaffold.

  ## Commands

  - `npm run build` — type-check.
  - `npm test` — run agent config tests.
  - `npm run seed` — pull sample grant rows from the public dataset.
  - `npm run dev "your prompt"` — run the Gemini agent stub.
  ```
- [ ] **Step 2: Commit**
  ```bash
  git add README.md
  git commit -m "docs: add setup README with manual account-setup steps"
  ```
