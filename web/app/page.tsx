"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Fragment, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "./api/chat/route";
import { ChainTrace } from "@/components/ChainTrace";
import { GrantTable, OrgChips, type GrantRow } from "@/components/GrantList";
import { RichText, type FilingIndex } from "@/components/RichText";

const SUGGESTIONS = [
  "If I donate to Silicon Valley Community Foundation, how many hops before it reaches a program?",
  "Which organizations both receive grants and re-grant them?",
  "Who are the biggest funders of Navigation Charitable Fund?",
];

// The model often calls several grant tools per answer; merge them into one de-duplicated table.
function collectGrants(message: ChatMessage): { rows: GrantRow[]; filings: FilingIndex } {
  const names = new Map<string, string>();
  const note = (o: { ein: string; name: string }) => names.set(o.ein, o.name);
  const nameOf = (ein: string) => ({ ein, name: names.get(ein) ?? `EIN ${ein}` });
  const hopRows: typeof pending = [];
  const pending: { funderEin: string; recipientEin: string; g: Omit<GrantRow, "funder" | "recipient"> }[] = [];

  for (const part of message.parts) {
    if (part.type === "tool-traceChain" && part.state === "output-available") {
      for (const { recipient, ...g } of part.output.startingGrants ?? []) {
        note(recipient);
        pending.push({ funderEin: part.input.startingEin, recipientEin: recipient.ein, g });
      }
      for (const h of part.output.hops) {
        note(h.funder);
        note(h.recipient);
        hopRows.push({
          funderEin: h.funder.ein,
          recipientEin: h.recipient.ein,
          g: { amountUsd: h.amountUsd, taxYear: h.taxYear, grantPurpose: null, sourceObjectId: h.sourceObjectId },
        });
      }
    } else if (part.type === "tool-getGrantsByFunder" && part.state === "output-available") {
      for (const { recipient, ...g } of part.output) {
        note(recipient);
        pending.push({ funderEin: part.input.ein, recipientEin: recipient.ein, g });
      }
    } else if (part.type === "tool-getGrantsByRecipient" && part.state === "output-available") {
      for (const { funder, ...g } of part.output) {
        note(funder);
        pending.push({ funderEin: funder.ein, recipientEin: part.input.ein, g });
      }
    }
  }

  const seen = new Set<string>();
  const rows: GrantRow[] = [];
  const filings: FilingIndex = {};
  // Grant-tool rows first so their purpose wins over the purpose-less rows from traceChain hops.
  for (const { funderEin, recipientEin, g } of [...pending, ...hopRows]) {
    filings[g.sourceObjectId] = funderEin;
    const id = `${funderEin}|${recipientEin}|${g.sourceObjectId}|${g.amountUsd}`;
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push({ ...g, funder: nameOf(funderEin), recipient: nameOf(recipientEin) });
  }
  rows.sort((a, b) => b.amountUsd - a.amountUsd);
  return { rows, filings };
}

export default function Page() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat<ChatMessage>({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const busy = status === "submitted" || status === "streaming";
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  function ask(text: string) {
    if (!text.trim() || busy) return;
    sendMessage({ text });
    setInput("");
  }

  return (
    <div className="app">
      <header className="top">
        <h1>Money Flow Agent</h1>
        <p>Follow a community-foundation donation through each re-granting hop, with the filing behind every step.</p>
      </header>

      <main className="thread">
        {messages.length === 0 ? (
          <section className="empty">
            <h2>Ask where a donation goes next</h2>
            <ul>
              {SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button type="button" onClick={() => ask(s)}>{s}</button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {messages.map((message) => {
          const { rows, filings } = collectGrants(message);
          let tableShown = false;
          return (
          <article key={message.id} className={`msg msg-${message.role}`}>
            {message.parts.map((part, i) => {
              const key = `${message.id}-${i}`;
              switch (part.type) {
                case "text":
                  return message.role === "user" ? <p key={key}>{part.text}</p> : <RichText key={key} text={part.text} filings={filings} />;
                case "tool-traceChain":
                  if (part.state !== "output-available") return null;
                  if (!tableShown && rows.length > 0) {
                    tableShown = true;
                    return (
                      <Fragment key={key}>
                        <ChainTrace result={part.output} />
                        <GrantTable rows={rows} />
                      </Fragment>
                    );
                  }
                  return <ChainTrace key={key} result={part.output} />;
                case "tool-getGrantsByFunder":
                case "tool-getGrantsByRecipient":
                  if (tableShown || rows.length === 0) return null;
                  tableShown = true;
                  return <GrantTable key={key} rows={rows} />;
                case "tool-findIntermediaries":
                  return part.state === "output-available" ? (
                    <OrgChips key={key} title="Organizations that receive and re-grant" orgs={part.output} />
                  ) : null;
                default:
                  return null;
              }
            })}
          </article>
          );
        })}

        {busy ? <p className="status" role="status">Tracing the grants…</p> : null}
        {error ? (
          <p className="error" role="alert">
            The agent couldn&apos;t answer. If this keeps happening, Gemini&apos;s free daily quota (20 requests) is probably used up. Try again tomorrow.
          </p>
        ) : null}
        <div ref={endRef} />
      </main>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about a donation's path…"
          aria-label="Your question"
        />
        <button type="submit" disabled={busy || !input.trim()}>Ask</button>
      </form>
    </div>
  );
}
