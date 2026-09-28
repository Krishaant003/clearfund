import { tool } from "ai";
import { z } from "zod";
import { sanityQuery } from "./sanity-client.ts";

interface OrgRef {
  ein: string;
  name: string;
}

export interface GrantByFunderSummary {
  recipient: OrgRef;
  amountUsd: number;
  taxYear: number;
  grantPurpose: string | null;
  matchTier: string;
  sourceObjectId: string;
}

export interface GrantByRecipientSummary {
  funder: OrgRef;
  amountUsd: number;
  taxYear: number;
  grantPurpose: string | null;
  matchTier: string;
  sourceObjectId: string;
}

export interface ChainHop {
  funder: OrgRef;
  recipient: OrgRef;
  amountUsd: number;
  taxYear: number;
  sourceObjectId: string;
}

export interface TraceChainResult {
  hops: ChainHop[];
  endedReason: "max_hops" | "no_further_grants";
}

const getGrantsByFunder = tool({
  description: "Get all grants where the given organization (by EIN) is the funder.",
  inputSchema: z.object({ ein: z.string().describe("The funder's EIN") }),
  execute: async ({ ein }): Promise<GrantByFunderSummary[]> => {
    return sanityQuery<GrantByFunderSummary[]>(
      `*[_type == "grant" && funder->ein == $ein] | order(amountUsd desc) {
        amountUsd, taxYear, grantPurpose, matchTier, sourceObjectId,
        "recipient": recipient->{ein, name}
      }`,
      { ein }
    );
  },
});

const getGrantsByRecipient = tool({
  description: "Get all grants where the given organization (by EIN) is the recipient.",
  inputSchema: z.object({ ein: z.string().describe("The recipient's EIN") }),
  execute: async ({ ein }): Promise<GrantByRecipientSummary[]> => {
    return sanityQuery<GrantByRecipientSummary[]>(
      `*[_type == "grant" && recipient->ein == $ein] | order(amountUsd desc) {
        amountUsd, taxYear, grantPurpose, matchTier, sourceObjectId,
        "funder": funder->{ein, name}
      }`,
      { ein }
    );
  },
});

const findIntermediaries = tool({
  description: "Find organizations that are both a grant recipient and a grant funder somewhere in the dataset — genuine re-granting intermediaries.",
  inputSchema: z.object({}),
  execute: async (): Promise<OrgRef[]> => {
    return sanityQuery<OrgRef[]>(
      `*[_type == "organization"
        && count(*[_type == "grant" && recipient._ref == ^._id]) > 0
        && count(*[_type == "grant" && funder._ref == ^._id]) > 0
      ]{ein, name}`
    );
  },
});

const traceChain = tool({
  description: "Walk the funder-to-recipient chain starting from an organization's EIN, up to max_hops, following the largest grant at each step. Returns the hop-by-hop chain with citations.",
  inputSchema: z.object({
    startingEin: z.string().describe("EIN of the starting funder"),
    maxHops: z.number().int().min(1).max(5).default(3),
  }),
  execute: async ({ startingEin, maxHops }): Promise<TraceChainResult> => {
    const hops: ChainHop[] = [];
    let currentEin = startingEin;

    for (let i = 0; i < maxHops; i++) {
      const nextHop = await sanityQuery<ChainHop | null>(
        `*[_type == "grant" && funder->ein == $ein] | order(amountUsd desc) [0] {
          amountUsd, taxYear, sourceObjectId,
          "funder": funder->{ein, name},
          "recipient": recipient->{ein, name}
        }`,
        { ein: currentEin }
      );

      if (!nextHop) {
        return { hops, endedReason: "no_further_grants" };
      }

      hops.push(nextHop);
      currentEin = nextHop.recipient.ein;
    }

    return { hops, endedReason: "max_hops" };
  },
});

export const tools = {
  getGrantsByFunder,
  getGrantsByRecipient,
  findIntermediaries,
  traceChain,
};
