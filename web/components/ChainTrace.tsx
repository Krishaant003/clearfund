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
