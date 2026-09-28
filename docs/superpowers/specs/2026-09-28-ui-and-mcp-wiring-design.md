# UI + Real MCP Wiring — Design Spec

**Spec:** `spec.md` (repo root), primarily sections 5 (flagship query), 6
(agent architecture), 7 (rate limits). This design implements the parts of
those sections deferred by the original scaffold plan
(`docs/superpowers/plans/2026-09-28-project-scaffold.md`): the actual MCP
client, the custom tool surface, and a UI, none of which existed before now.

## 1. Goal

Replace the CLI stub (`agent/index.ts`, plain Gemini call, no tools) with a
real agent that can answer the flagship question — *"If I donate to
Silicon Valley Community Foundation, how many re-granting hops before it
reaches a program-delivering org?"* — backed by a deployed Next.js chat UI
that also renders the traced chain as a diagram, deployed publicly on
Vercel.

## 2. What's in scope / out of scope

**In scope:**
- Next.js App Router project (new `web/` directory) with a chat UI
- `/api/chat` route running the real agent loop (Gemini + tools)
- A live connection to the Sanity Context MCP endpoint
- Custom tools (`get_grants_by_funder`, `find_intermediaries`,
  `trace_chain`) implemented against `@sanity/client` (GROQ), matching
  spec §6's suggested tool surface
- Exponential backoff on 429s from Gemini and Sanity — spec §7 says this
  must exist *before* the agent makes live calls in a loop, which is what
  this spec builds
- Rendering the `trace_chain` tool's structured result as a chain diagram
  (Org → Org → Org) alongside the prose answer
- Deploying `web/` to Vercel

**Out of scope (explicitly deferred):**
- Spec §11's stretch feature (`purposeCategory` / `purposeSectorMismatch`)
  — spec itself says build this only after the full agent works end-to-end,
  which this spec is what makes true. Follow-up work, not this spec.
- Login/auth for the deployed app — not required by the challenge; if we
  don't add one, no test credentials are needed in the submission either
- Editing/writing content from the UI — the deployed app is read-only
  (query only); writes stay in `scripts/write-seed-data.ts`, run manually
- Task 6 of the scaffold plan (README) — human partner asked to keep this
  last, written once this work (and the UI) actually exists to document

## 3. Project structure

Adopts the "Monorepo (Recommended with a frontend)" layout from Sanity's
own best-practices guidance — Studio and web app live side by side:

```
Money Flow Agent/
├── sanity/          # existing — Studio, schema (unchanged by this spec)
├── agent/           # existing — config.ts stays; index.ts (CLI stub)
│                    # becomes redundant once web/ exists, decide at
│                    # implementation time whether to delete or keep as a
│                    # quick local smoke-test script
├── scripts/         # existing — seed.ts, write-seed-data.ts (unchanged)
└── web/             # NEW — Next.js App Router app
    ├── app/
    │   ├── page.tsx           # chat UI
    │   └── api/chat/route.ts  # agent loop (Gemini + tools)
    ├── components/
    │   └── ChainTrace.tsx     # renders trace_chain tool-result as a diagram
    ├── lib/
    │   ├── sanity-client.ts   # @sanity/client instance, reused by tools
    │   ├── tools.ts           # get_grants_by_funder, find_intermediaries,
    │   │                      # trace_chain tool definitions
    │   └── with-backoff.ts    # exponential backoff wrapper for 429s
    └── package.json           # own deps (next, react, ai, @ai-sdk/google,
                                # @sanity/client, @modelcontextprotocol/sdk
                                # or whatever the AI SDK's MCP client needs)
```

`web/` gets its own `package.json` (same reasoning as `sanity/` needing one
— Next.js's build process expects to own its directory, not share the root
one).

## 4. Backend: `/api/chat` route

**Agent loop (per spec §6):**
```
User question
→ Gemini, via @ai-sdk/google (decides tool call, if any)
→ tool executes (Context MCP query, or one of our custom tools)
→ tool result returned to Gemini
→ Gemini synthesizes answer, citing sourceObjectId per claim
→ repeat while multi-hop traversal requires it
```

**Tool surface exposed to Gemini:**
1. **Sanity Context MCP tools** — whatever the deployed Context MCP
   endpoint (`https://api.sanity.io/v1/context/organizations/<ORG_ID>/mcp/money-flow-agent`)
   exposes natively (general retrieval over the Knowledge Base). This is
   what satisfies "meaningful use of Sanity Context" as a judging
   criterion — the agent genuinely queries through Context, not just the
   plain Content API.
2. **Custom tools**, implemented directly against `@sanity/client` (the
   same pattern already verified working in `scripts/write-seed-data.ts`):
   - `get_grants_by_funder(ein)` — grants where this org is the funder
   - `get_grants_by_recipient(ein)` — grants where this org is the recipient
   - `find_intermediaries()` — backs the flagship GROQ query (spec §5):
     orgs that are both a grant recipient and a grant funder somewhere in
     the dataset
   - `trace_chain(starting_ein, max_hops)` — walks funder → recipient →
     (recipient-as-funder) up to `max_hops`, returning the ordered chain
     with each hop's `sourceObjectId` for citation

**Why both, not just Context MCP:** Context's retrieval is built for
grounded Q&A over indexed text, not guaranteed-correct deterministic graph
traversal. `trace_chain` needs to be *right*, not just plausible — a
custom tool querying GROQ directly guarantees that. Both are exposed to
the same Gemini call; Gemini decides which to use per question.

**Rate limiting (spec §7):** wrap both the Gemini calls and Sanity
tool-executions in `lib/with-backoff.ts` — exponential backoff (e.g. 1s,
2s, 4s, capped retries) on 429 responses from either. This is a hard
requirement, not a nice-to-have, per spec §7's explicit "implement this
before it happens" instruction — and this spec is the first place a live
call-in-a-loop exists.

## 5. Frontend: chat + inline trace diagram

- `app/page.tsx` uses the Vercel AI SDK's `useChat` hook for the
  conversational UI (streaming text as it's generated)
- When a message includes a `trace_chain` tool-result part, `ChainTrace.tsx`
  renders it as a horizontal diagram: `Org (EIN) → Org (EIN) → Org (EIN)`,
  each arrow labeled with the grant amount/tax year, each org node
  clickable to show its `sourceObjectId` citation
- The diagram is drawn from the tool's structured return value, not parsed
  from Gemini's prose — this is what makes it trustworthy rather than a
  potential hallucination of the chain

## 6. Environment variables (new, beyond what exists)

`web/.env.local` (gitignored, same pattern as root `.env`):
- `SANITY_PROJECT_ID`, `SANITY_DATASET` — same values as root `.env`
- `SANITY_CONTEXT_TOKEN`, `SANITY_ORG_ID` — same org-level Context Viewer
  token already created; used both for the MCP connection and for the
  custom tools' `@sanity/client` reads (Context Viewer permission should
  cover read-only GROQ queries — verify this at implementation time; if it
  doesn't, a second read-only project-level token may be needed)
- `GOOGLE_GENERATIVE_AI_API_KEY` — same key already in root `.env`

These get set again in Vercel's project settings for the deployed app
(Vercel doesn't read the repo's local `.env` files).

## 7. Deployment

`web/` deploys to Vercel as a standard Next.js app (`vercel --cwd web` or
connecting the repo with a root directory override of `web/` in Vercel's
project settings). No custom infrastructure needed.

## 8. Open risks / things to verify at implementation time

- **Exact Context MCP tool names/shapes** are not yet known — I have not
  seen the live endpoint's tool list. The implementation plan should
  start by connecting and introspecting available tools before assuming
  specific names.
- **Whether `SANITY_CONTEXT_TOKEN` (Context Viewer) permits plain GROQ
  reads via `@sanity/client`**, or whether the custom tools need a
  separate read-only project token — verify with a real query early in
  implementation, not assumed.
- **Whether the exact Vercel AI SDK MCP client API** (function names,
  import paths) matches what's described above — verify via current docs
  at implementation time rather than trusting this spec's wording, which
  is describing capability, not exact syntax.

## 9. Deferred: README (Task 6 of the scaffold plan)

Per human partner's explicit instruction, `README.md` is written *last* —
once `trace_chain`, the MCP wiring, and the UI all actually exist, so it
documents the real, working setup rather than a partial one.
