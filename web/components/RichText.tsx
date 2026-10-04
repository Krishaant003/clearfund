import { Fragment, type ReactNode } from "react";
import { filingUrl } from "@/lib/format";

// Maps sourceObjectId -> funder EIN so cited IDs in the model's prose can link to the filing.
export type FilingIndex = Record<string, string>;

function inline(text: string, filings: FilingIndex): ReactNode[] {
  const cleaned = text.replace(/\$\\rightarrow\$/g, "→").replace(/\$\\to\$/g, "→");
  return cleaned.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      const code = part.slice(1, -1);
      const ein = filings[code];
      return ein ? (
        <a key={i} className="src" href={filingUrl(ein, code)} target="_blank" rel="noopener noreferrer">IRS filing</a>
      ) : (
        <code key={i}>{code}</code>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

// Minimal rendering for the model's replies: headings, paragraphs, bullet/numbered lists, **bold**, `code`.
export function RichText({ text, filings }: { text: string; filings: FilingIndex }) {
  const out: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) out.push(<p key={out.length}>{inline(para.join(" "), filings)}</p>);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, i) => <li key={i}>{inline(it, filings)}</li>);
    out.push(list.ordered ? <ol key={out.length}>{items}</ol> : <ul key={out.length}>{items}</ul>);
    list = null;
  };

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (!line) {
      flushPara();
      flushList();
    } else if (/^-{3,}$/.test(line)) {
      flushPara();
      flushList();
      out.push(<hr key={out.length} />);
    } else if (heading) {
      flushPara();
      flushList();
      out.push(<h4 key={out.length}>{inline(heading[2], filings)}</h4>);
    } else if (bullet || numbered) {
      flushPara();
      const ordered = !!numbered;
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return <>{out}</>;
}
