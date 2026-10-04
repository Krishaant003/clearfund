export function formatUsd(amount: number): string {
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(2)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  return `$${amount.toLocaleString("en-US")}`;
}

// The funder files the 990, so the link needs the funder's EIN.
export function filingUrl(funderEin: string, sourceObjectId: string): string {
  return `https://projects.propublica.org/nonprofits/organizations/${funderEin.replace(/\D/g, "")}/${sourceObjectId}/full`;
}
