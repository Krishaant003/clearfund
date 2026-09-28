# Money Flow Agent — Sanity Challenge Path One Spec

## 1. What this is

An AI agent that answers "where does the money actually go?" for US community
foundation grants — tracing donations through re-granting intermediaries
(e.g. donor-advised-fund sponsors like Fidelity Charitable) to see how many
hops a dollar takes before it's likely to reach a program-delivering
organization.

**Challenge track:** dev.to Sanity Challenge, Path One — "Ship an Agent That
Queries Real Content." Agent queries a Sanity Knowledge Base via Sanity
Context MCP; must demonstrate an answer that requires structure, not just
keyword search.

**Why this domain passes the "keyword search would already answer this" bar:**
"Is Foundation X a registered charity" is googleable. "Does Foundation X's
money reach a program directly, or pass through N re-granting intermediaries
before it does" is not answerable by any single page — it requires walking a
reference graph. See `docs/design-rationale.md` (Section 6) for the full
argument; keep this framing front-of-mind in the submission writeup.

---

## 2. Data source

**Dataset:** funder-graph — open IRS Form 990-PF Part XV / Form 990 Schedule I
grant data, pre-parsed and EIN-matched.

- Repo: https://github.com/egeria-corporation/funder-graph
- Manifest (source of truth for what's actually published):
  `https://data.opengrants.io/funder-graph/2026.09.0/manifest.json`
- Parquet files, queryable via DuckDB over HTTPS, no auth:
  `https://data.opengrants.io/funder-graph/2026.09.0/grants/filing_year={YYYY}/part-0000.parquet`
  (years available: 2019–2026)
- License: Apache 2.0 (derived structure); underlying data is US federal
  government work, not copyrightable.

**Known data-quality facts to respect (from the dataset's own manifest):**
- `precision_verified: false` — match-confidence tiers are stated goals, not
  yet validated against a hand-labeled sample. **Filter to `match_tier` A or
  B only** when seeding Sanity content.
- `amount_type` is either `paid` or `approved_future` — **never sum both**;
  default to `amount_type = 'paid'`.
- Some foundations report grantees only as an aggregate placeholder
  (`VARIOUS ORGANIZATIONS`) with no structured recipient — these rows have no
  usable recipient and should be excluded from seed data.
- Filings lag real time by roughly a year; this is historical data, not live.

**Example query (DuckDB) to pull seed rows for one funder:**
```sql
INSTALL httpfs; LOAD httpfs;

SELECT funder_ein, funder_name, recipient_name_raw, recipient_ein_resolved,
       recipient_state, amount_usd, tax_year, grant_purpose,
       match_confidence, match_tier, object_id
FROM read_parquet(
  ['https://data.opengrants.io/funder-graph/2026.09.0/grants/filing_year=2023/part-0000.parquet',
   'https://data.opengrants.io/funder-graph/2026.09.0/grants/filing_year=2024/part-0000.parquet'],
  hive_partitioning = 1
)
WHERE funder_ein = '205205488'          -- Silicon Valley Community Foundation
  AND amount_type = 'paid'
  AND match_tier IN ('A', 'B')
ORDER BY amount_usd DESC
LIMIT 50;
```

---

## 3. Seed organizations (confirmed real EINs)

Use these as the seed set — chosen because public records already confirm
they form real multi-hop chains, not hypothetical ones:

| Organization | EIN | Role in chain |
|---|---|---|
| Silicon Valley Community Foundation | 20-5205488 | Primary funder (community foundation) |
| Chicago Community Trust | 36-2167000 | Primary funder (community foundation) |
| The Real Estate Trust of SVCF | 04-3701887 | Intermediary — grants back to SVCF and to Sobrato Foundation |
| Fidelity Investments Charitable Gift Fund | (look up via BMF/dataset) | Downstream funder — receives from SVCF, re-grants onward |
| Schwab Charitable Fund | (look up via BMF/dataset) | Downstream funder — same pattern as Fidelity Charitable |
| The Sobrato Foundation | (look up via BMF/dataset) | Recipient of Real Estate Trust grant |

**Seeding target:** ~6-8 funder organizations, ~15-20 downstream recipient
organizations (prioritize ones that are *also* funders elsewhere in the
dataset — that's what makes a node a genuine intermediary), and their
connecting `grant` documents filtered to tier A/B, `amount_type = 'paid'`.
Target total document count: comfortably under the 150-document Knowledge
Base beta cap — aim for 100-130 documents total across all types.

---

## 4. Sanity schema

**Design principle (do not deviate from this):** ONE `organization` document
type, not separate `funder`/`recipient` types. Role (funder vs. recipient) is
determined by how an org is *referenced* in a `grant` document, not by its
own type. This is what makes an org that both receives and re-grants money
(e.g. Fidelity Charitable) resolvable as a single graph node instead of two
disconnected records — without this, multi-hop traversal breaks.

```ts
// schemas/organization.ts
import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'organization',
  title: 'Organization',
  type: 'document',
  fields: [
    defineField({ name: 'ein', title: 'EIN', type: 'string', validation: (Rule) => Rule.required() }),
    defineField({ name: 'name', title: 'Name', type: 'string', validation: (Rule) => Rule.required() }),
    defineField({ name: 'state', title: 'State', type: 'string' }),
    defineField({ name: 'nteeCode', title: 'NTEE Code', type: 'string', description: 'Sector classification, e.g. T31 = Foundations & Grantmakers' }),
    defineField({ name: 'subsectionCode', title: 'IRC Subsection', type: 'string', description: 'e.g. 501(c)(3)' }),
  ],
})
```

```ts
// schemas/grant.ts
import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'grant',
  title: 'Grant',
  type: 'document',
  fields: [
    defineField({ name: 'funder', title: 'Funder', type: 'reference', to: [{ type: 'organization' }], validation: (Rule) => Rule.required() }),
    defineField({ name: 'recipient', title: 'Recipient', type: 'reference', to: [{ type: 'organization' }], validation: (Rule) => Rule.required() }),
    defineField({ name: 'amountUsd', title: 'Amount (USD)', type: 'number' }),
    defineField({
      name: 'amountType', title: 'Amount Type', type: 'string',
      options: { list: ['paid', 'approved_future'] },
      description: 'Never sum both types together — see dataset docs.',
    }),
    defineField({ name: 'taxYear', title: 'Tax Year', type: 'number' }),
    defineField({ name: 'grantPurpose', title: 'Grant Purpose', type: 'text' }),
    defineField({
      name: 'matchConfidence', title: 'Match Confidence', type: 'number',
      description: '0.0-1.0, from source dataset. Only tier A/B rows should be seeded.',
    }),
    defineField({ name: 'matchTier', title: 'Match Tier', type: 'string', options: { list: ['A', 'B', 'C', 'D', 'U'] } }),
    defineField({
      name: 'sourceObjectId', title: 'Source Filing Object ID', type: 'string',
      description: 'IRS OBJECT_ID of the source filing — provenance/citation key.',
    }),
  ],
})
```

**Explicitly not included (and why):** no separate `filing` document type —
it doesn't serve a query this agent needs yet, and every extra type costs
budget against the 150-doc cap. Add only if a specific feature requires it.

---

## 5. The flagship query (design target for agent capability)

This is the query that demonstrates "structure was necessary" — it cannot be
answered by any single web page or flat search:

```groq
// Organizations that are BOTH a recipient of some grant AND a funder of
// another — i.e. genuine re-granting intermediaries.
*[_type == "organization"
  && count(*[_type == "grant" && recipient._ref == ^._id]) > 0
  && count(*[_type == "grant" && funder._ref == ^._id]) > 0
]
```

The agent should be able to answer, e.g.: *"If I donate to Silicon Valley
Community Foundation, does my money reach a program directly, or pass
through an intermediary first?"* — by tracing `grant` references from SVCF
outward, checking at each hop whether the recipient is itself a `funder` in
another `grant`, and reporting the chain with sources cited via
`sourceObjectId`.

---

## 6. Agent architecture

**Stack: TypeScript/Node, Vercel AI SDK, Google Gemini via `@ai-sdk/google`**
(model: Gemini 3.8 Flash — originally spec'd as Gemini 3.5 Flash Lite for RPD
headroom on the free tier, but 3.5 Flash Lite was hitting sustained `503
high demand` errors during implementation and Google's own API now points
callers of the deprecated `gemini-2.5-flash` at 3.8 Flash; verify current
rate limits at aistudio.google.com/rate-limit before relying on this
long-term, as Google does not publish a static free-tier table).

**Why this switch from the original Python plan:** Sanity's official tooling
(the `create-agent-with-sanity-context` skill, every reference
implementation, every example Path One submission found during research —
Rulebook Oracle, DevDocs, Detection Debt, RenderProof) is Node/TypeScript +
Vercel AI SDK. Critically, `@ai-sdk/google` supports Gemini directly, so this
switch does not cost the free-tier Gemini choice at all — it only removes
the need to hand-build an MCP client and a Gemini-function-calling
translation layer from scratch, which the Sanity skill generates
automatically. Schema authoring (Section 4) was already TypeScript either
way; this switch just makes the runtime match the tooling instead of
fighting it.

**Setup:**
```
npx skills add sanity-io/context --all
```
Then, in the project directory, prompt the coding agent: *"Use the
create-agent-with-sanity-context skill to help me build an agent in this
project."* This scaffolds the MCP client, an example agent, and optionally a
frontend, walking through configuration interactively.

**Agent loop, at a high level:**
```
User question
  → Gemini, via @ai-sdk/google (decides which MCP tool to call, if any)
  → Vercel AI SDK's MCP client calls the Sanity Context MCP endpoint
  → tool result returned to Gemini
  → Gemini synthesizes final answer, citing sourceObjectId per claim
  → (repeat tool calls if multi-hop traversal requires it)
```

**MCP endpoint setup requirements (easy to get wrong — confirm before
building):**
- Sanity Context requires a **deployed** Sanity Studio — a dataset with
  content but no deployed Studio will not work.
- Authentication requires an **organization-level API token** with Context
  Viewer permission — a project-level token will not work.
- Endpoint URL pattern: `https://api.sanity.io/v1/context/organizations/<ORG_ID>/mcp/<name>`

**Suggested MCP tool surface to expose:**
- `get_grants_by_funder(ein)` — grants where this org is the funder
- `get_grants_by_recipient(ein)` — grants where this org is the recipient
- `find_intermediaries()` — orgs that are both funder and recipient somewhere
  in the dataset (backs the flagship query above)
- `trace_chain(starting_ein, max_hops)` — walk funder → recipient →
  (recipient-as-funder) → ... up to max_hops, returning the path with sources

---

## 7. Rate limit constraints (plan around these, don't discover them mid-build)

- **Gemini 3.8 Flash free tier: confirmed hard cap of 20 requests/day**,
  total, shared across all usage of this model on this Google Cloud
  project (`quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier`,
  hit live during implementation on 2026-09-28). This is drastically
  tighter than the 15 RPM / 500 RPD figures originally quoted here for
  3.5 Flash Lite (measured before the switch, no longer applicable). Since
  each agent turn costs 2+ model calls, 20 RPD is roughly 8-10 user
  messages/day, total — for the deployed demo AND all future testing
  combined. Accepted as a known, explicitly documented limitation for the
  submission write-up (human partner's call, given 3.5 Flash Lite was
  hitting sustained `503 high demand` errors instead) — do not "discover"
  this again; if judging needs more headroom, either enable billing on
  the Google Cloud project or re-attempt 3.5 Flash Lite's availability.
- **Sanity Context / project-level limits:** also check — other Path One
  submissions reported ~20 RPM shared across a whole Sanity project, which
  can be the tighter constraint depending on usage.
- **Mitigation:** build and test the MCP↔Gemini bridge plumbing against a
  local stub/mock first; save real API calls for testing actual agent
  reasoning, not for debugging Python. Implement exponential backoff for
  429 errors from the start.

---

## 8. Judging criteria alignment (from the official challenge page)

Path One is scored on: (1) meaningful use of Sanity Context and structured
content, (2) technical implementation and code quality, (3) use of Knowledge
Bases, (4) usability. Three of four criteria are about whether the
underlying design was sound, not about agent conversational polish — do not
over-invest build time in prompt-engineering tone; invest it in making sure
the flagship traversal query genuinely works and is demonstrable.

**Framing note for the writeup:** present this as a neutral, factual
transparency tool ("here are the two facts, sourced, you decide") — not as
advocacy or a verdict on any funder's practices. Let the graph speak.

---

## 9. Submission requirements checklist (dev.to, official rules)

- [ ] Separate post using the Path One submission template
- [ ] Tag: `#sanitychallenge` (plus `devchallenge`, `sanity`, `ai`)
- [ ] Include Sanity project ID or public dataset URL — submissions without
      this may be marked incomplete
- [ ] If the app requires login, provide test credentials/instructions
- [ ] Optional but encouraged: upload an agent session transcript (Claude
      Code, etc.) via the Agent Sessions uploader — must be set to Public,
      and scrubbed of API keys/secrets before publishing
- [ ] Deadline: October 4, 2026, 11:59 PM PDT

---

## 10. Explicitly out of scope for this build

- No separate corporate-donor-to-foundation tracing via SEC EDGAR text
  parsing — out of scope for a one-week build; the community foundation
  data alone gives genuine multi-hop without it.
- No GlobalGiving / project-level "did the money get spent as claimed"
  layer — Schedule I / Part XV grant data only.
- No App SDK / Workflows (Path Two bonus features) — not applicable to
  Path One.

---

## 11. Stretch (optional): closing the "structure was imposed, not just reused" gap

**The honest gap in the core build:** the source Parquet data already has
`funder_ein`/`recipient_ein` as relational columns — someone could run a
recursive self-join in DuckDB and get the same intermediary-tracing result
with no Sanity involved. Sanity/Context is genuinely valuable here (it turns
already-structured data into something an LLM can query via tool-calling
without a hand-built API server), but a sharp judge could fairly say "you
re-hosted structure, you didn't create it." This section is how to close
that gap — **optional, additive, do not let it delay the core build.**

**The change:** `grant_purpose` is currently a passive text field — stored
verbatim, only ever displayed back to the user. Add a step (data pipeline or
agent-side tool) that reads this free text and derives something structured
that does not exist anywhere in the source data:

1. **`purposeCategory`** — classify `grant_purpose` into a fixed taxonomy
   (e.g. `capacity_building`, `direct_service`, `capital_facilities`,
   `research`, `general_operating`). Add as a new field on `grant`.
2. **`purposeSectorMismatch`** — boolean, comparing the *stated* grant
   purpose against the recipient organization's `nteeCode` (already in the
   `organization` schema) — e.g. arts-sounding purpose text granted to an
   org classified under health services. Flags a genuine discrepancy worth
   surfacing to a user, not just displaying data.

**Why this specifically closes the gap:** neither field exists in the
source Parquet files. Producing them requires the agent/pipeline to *read
and judge* unstructured prose, not just follow a reference that was already
there — this is the strict version of "the agent only works because content
was structured," versus the weaker "we re-hosted an existing relational
schema."

**Scope estimate:** small — a classification pass over the ~100-130 seeded
grants, likely LLM-assisted (Gemini call per grant, or batched), roughly a
day's work. Build this only after Sections 1-10 are working end-to-end.