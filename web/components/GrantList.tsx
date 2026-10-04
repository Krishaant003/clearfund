import { filingUrl, formatUsd } from "@/lib/format";

export interface GrantRow {
  funder: { ein: string; name: string };
  recipient: { ein: string; name: string };
  amountUsd: number;
  taxYear: number;
  grantPurpose: string | null;
  sourceObjectId: string;
}

export function GrantTable({ rows }: { rows: GrantRow[] }) {
  const max = Math.max(...rows.map((r) => r.amountUsd));
  return (
    <section className="grants" aria-label="Grants found">
      <h3 className="grants-title">Grants found ({rows.length})</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">From</th>
              <th scope="col">To</th>
              <th scope="col" className="num">Amount</th>
              <th scope="col">Year</th>
              <th scope="col">Purpose</th>
              <th scope="col">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.sourceObjectId}-${r.recipient.ein}-${i}`}>
                <td>{r.funder.name}</td>
                <td>{r.recipient.name}</td>
                <td className="num">
                  {formatUsd(r.amountUsd)}
                  <span className="grant-bar" style={{ width: `${Math.max(4, (r.amountUsd / max) * 100)}%` }} />
                </td>
                <td>{r.taxYear}</td>
                <td>{r.grantPurpose ?? "—"}</td>
                <td>
                  <a className="src" href={filingUrl(r.funder.ein, r.sourceObjectId)} target="_blank" rel="noopener noreferrer">
                    IRS filing
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function OrgChips({ title, orgs }: { title: string; orgs: { ein: string; name: string }[] }) {
  return (
    <section className="grants" aria-label={title}>
      <h3 className="grants-title">{title}</h3>
      <ul className="chips">
        {orgs.map((o) => (
          <li key={o.ein} className="chip">{o.name}</li>
        ))}
      </ul>
    </section>
  );
}
