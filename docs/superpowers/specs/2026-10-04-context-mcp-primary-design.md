# Context MCP as the primary path, then purposeCategory

## Goal
Make the Sanity Context MCP endpoint (Knowledge Base mode) the agent's main way of reading grant data, and make that visible, because judging criteria 1 (Context + structured content) and 3 (Knowledge Bases) depend on it. Then, if time remains, add `purposeCategory` as the one piece of structure the project creates itself.

## Current state (verified in `web/app/api/chat/route.ts`)
- MCP tools are merged with four custom GROQ tools; the system prompt only mentions `traceChain`.
- If the MCP connection fails, the route logs and silently continues with custom tools.
- In a live SVCF run the model made no MCP calls.
- The UI only renders custom tool output, so MCP calls are invisible.
- Custom tools read through `@sanity/client` with `SANITY_READ_TOKEN`, a direct dataset read.

## Part A: Context MCP primary (do first)
1. **Prompt:** instruct the model to query the Knowledge Base through the MCP tools first and cite what they return.
2. **Tool set:** keep `traceChain` (multi-hop walk is a computation, not a lookup). Remove `getGrantsByFunder`, `getGrantsByRecipient`, `findIntermediaries` only if testing shows MCP answers those questions correctly. Otherwise keep them and say so.
3. **No silent fallback:** if the MCP connection fails, return an explicit error response.
4. **Visible proof:** each answer shows a "Sources" strip listing the MCP tool calls made. MCP results render in the same grant table as custom results where their shape allows.
5. **Test:** a route test asserts that a grants question produces at least one MCP tool call. It runs against the live endpoint and costs a few Gemini requests.
6. **Write-up honesty:** `traceChain` still reads via `@sanity/client`; the README/submission says so.

## Part B: purposeCategory (only after A, optional)
- New `grant.purposeCategory` string field: `capacity_building`, `direct_service`, `capital_facilities`, `research`, `general_operating`, `other`.
- One-off script `scripts/classify-purposes.ts`: 64 grants, ~15 per Gemini call (~5 calls), structured output with the enum, skips grants already classified, pauses between calls, supports `--dry-run`, writes via Sanity patches.
- Spot-check the labels by hand before relying on them.
- Served through the Context MCP endpoint (verify it exposes the new field) and shown as a table column.
- **Dropped:** `purposeSectorMismatch` (reads as an accusation, conflicts with the neutral-transparency framing in spec.md §8, and would be noisy).

## Out of scope
Deployment (the user does it last), README changes, model changes, and the structured-vs-flat comparison run (Part C, declined by the user).

## Risks
- Gemini 3.1 Flash Lite may not reliably prefer MCP tools; measure, and remove duplicate custom tools to force it if needed.
- Live tests consume Gemini quota.
