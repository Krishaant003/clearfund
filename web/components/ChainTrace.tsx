import type { TraceChainResult } from "@/lib/tools";
import { filingUrl, formatUsd } from "@/lib/format";

export function ChainTrace({ result }: { result: TraceChainResult }) {
  const { hops, endedReason } = result;
  if (hops.length === 0) {
    return <p className="note">No grants found from this organization, so the chain ends here.</p>;
  }

  const maxAmount = Math.max(...hops.map((h) => h.amountUsd));
  const last = hops[hops.length - 1];
  const nodes = [hops[0].funder, ...hops.map((h) => h.recipient)];

  return (
    <figure className="trace" aria-label={`Grant chain with ${hops.length} hops`}>
      <figcaption className="trace-head">
        <span className="trace-count">{hops.length}</span>
        <span className="trace-count-label">{hops.length === 1 ? "hop" : "hops"} from {nodes[0].name} to {last.recipient.name}</span>
      </figcaption>
      <ol className="trace-list">
        {nodes.map((node, i) => {
          const hop = hops[i];
          const role = i === 0 ? "start" : i === nodes.length - 1 ? "end" : "mid";
          return (
            <li key={i} className="trace-step">
              <div className={`node node-${role}`}>
                <span className="node-name">{node.name}</span>
                <span className="node-meta">
                  {role === "start" ? "Where the donation starts" : role === "end" ? "Where this trace stops" : "Passes money on"} · EIN {node.ein}
                </span>
              </div>
              {hop ? (
                <div className="flow">
                  <span
                    className="flow-band"
                    style={{ width: `${Math.max(8, Math.round((hop.amountUsd / maxAmount) * 100))}%` }}
                  />
                  <span className="flow-label">
                    <strong>{formatUsd(hop.amountUsd)}</strong> in {hop.taxYear}
                    <a className="src" href={filingUrl(hop.funder.ein, hop.sourceObjectId)} target="_blank" rel="noopener noreferrer">
                      View IRS filing (opens ProPublica)
                    </a>
                  </span>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      <p className="note">
        {endedReason === "no_further_grants"
          ? `${last.recipient.name} has no outgoing grants in the data, so the trace ends here.`
          : "Stopped at the hop limit. The money may keep moving past this point."}
      </p>
    </figure>
  );
}
