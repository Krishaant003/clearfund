# Money Flow Agent

Traces US community foundation grants through re-granting intermediaries to
answer "if I donate to Silicon Valley Community Foundation, how many hops
before the money reaches a program-delivering org?" Built for the dev.to
Sanity Challenge, Path One. See `spec.md` for the full design.

The agent uses a real, deployed Sanity Context MCP endpoint (Knowledge Base
mode) plus custom GROQ-based tools (`getGrantsByFunder`,
`getGrantsByRecipient`, `findIntermediaries`, `traceChain`), queried directly
against seeded grant/organization data via `@sanity/client`. Gemini decides
which to use per question. `traceChain`'s structured output is rendered as a
chain diagram, not parsed from prose, so citations trace back to real
`sourceObjectId`s.

## Current status

- **Done:** Sanity schema + seeded data, Sanity Studio, the Next.js chat app
  in `web/` (real MCP client, custom tools, chat UI, chain-diagram
  rendering) — see `docs/superpowers/plans/2026-09-28-ui-and-mcp-wiring-plan.md`
  and its ledger at
  `.superpowers/sdd/2026-09-28-ui-and-mcp-wiring-plan/progress.md` for the
  full task-by-task history, every deviation from plan, and why.
- **Pending:** Task 8 of that plan — deploying `web/` to Vercel. Not started.

## Project layout

```
money-flow-agent/
├── sanity/    # Studio + schema (organization, grant) — own package.json
├── agent/     # CLI stub (agent/index.ts) — superseded by web/, kept as a
│              # quick local smoke-test script
├── scripts/   # seed.ts (pulls sample data), write-seed-data.ts (writes
│              # real seed data into Sanity)
└── web/       # the actual product — Next.js chat app, own package.json
```

## Local setup

```bash
npm install                 # root
cd sanity && npm install && cd ..
cd web && npm install && cd ..
```

Env vars live in two places:
- **root `.env`** (copy from `.env.example`) — used by `scripts/` and
  `agent/index.ts`.
- **`web/.env.local`** — used by the Next.js app. Needs the same Sanity/Google
  values as root `.env`, since Vercel doesn't read the repo's `.env` files
  and Next.js doesn't read the root `.env` either.

Required vars (see `.env.example` for the annotated version):
- `SANITY_PROJECT_ID`, `SANITY_DATASET` — from sanity.io/manage.
- `SANITY_ORG_ID`, `SANITY_CONTEXT_TOKEN` — Sanity Context requires an
  **organization-level** API token with Context Viewer permission. A
  project-level token will not work here.
- `SANITY_READ_TOKEN` — a **project-level** token for plain GROQ reads
  (the custom tools use this via `@sanity/client`, not the Context token —
  `SANITY_CONTEXT_TOKEN` returns 401 on plain GROQ queries). In this repo
  it currently reuses the value of `SANITY_WRITE_TOKEN` (see "Known
  limitations" below) rather than a dedicated read-only token.
- `GOOGLE_GENERATIVE_AI_API_KEY` — from aistudio.google.com/apikey.

The Sanity Context MCP endpoint itself (`money-flow-agent`, Knowledge Base
mode) is already created in the Sanity Dashboard's Context app under this
org — it's dashboard-only configuration, not something `npm install`
recreates. If you're setting this up under a different org/project, you'll
need to create it there first (Context app → New endpoint → point it at a
Knowledge Base or dataset source).

## Running it

```bash
cd web
npm run dev
```

Open http://localhost:3000 and ask something like *"If I donate to Silicon
Valley Community Foundation, how many hops before it reaches a program?"*

To browse/edit the underlying Sanity data:

```bash
cd sanity
npm run dev
```

## Commands (in `web/`)

- `npm run dev` — local dev server.
- `npm run build` — production build (also type-checks).
- `npm run typecheck` — `tsc --noEmit` only, faster than a full build.
- `npm test` — runs `lib/*.test.ts` and `app/api/chat/*.test.ts` against
  **real** Sanity data and a **real** Gemini call (no mocks) — see "Known
  limitations" for why this can fail on quota, not code.

Commands at the repo root (`agent/`, `scripts/`) are for local
smoke-testing and seeding, not the deployed product:
- `npm run dev "your prompt"` — the old CLI stub in `agent/index.ts`.
- `npm run seed` / `npm run seed:write` — pull/write sample grant data.

## Known limitations (read before assuming something's broken)

- **Gemini free tier is capped at 20 requests/day**, total, for
  `gemini-3.8-flash` on this Google Cloud project
  (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`). Each conversation
  turn costs 2+ model calls, so that's roughly 8-10 messages/day, shared
  across all testing and real usage. This was hit for real during
  development (see the plan's ledger, Task 7). The original spec choice,
  `gemini-3.5-flash-lite`, had a much higher free-tier budget (500 RPD) but
  was returning sustained `503 high demand` errors during implementation —
  switching back is an option if that resolves. The chat UI shows a
  loading/error state so quota exhaustion doesn't look like a silent crash.
- **`SANITY_READ_TOKEN` currently carries write scope** (it's
  `SANITY_WRITE_TOKEN`'s value). The app's own code is read-only, but the
  credential isn't. Minting a dedicated Viewer-role project token is a
  ~2 minute fix in sanity.io/manage and is recommended before wide/public
  deployment.
- Two of `web/`'s tests make live Gemini calls and will fail with a generic
  `"An error occurred"` if the daily quota above is exhausted — this is
  expected and not a code defect; the rest of the test suite (backoff,
  Sanity client, custom tools) doesn't depend on Gemini and should always
  be reliable.


