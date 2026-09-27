export interface AgentConfig {
  sanityProjectId: string;
  sanityDataset: string;
  sanityOrgId: string;
  sanityContextToken: string;
  googleApiKey: string;
}

const REQUIRED_ENV_VARS = [
  "SANITY_PROJECT_ID",
  "SANITY_DATASET",
  "SANITY_ORG_ID",
  "SANITY_CONTEXT_TOKEN",
  "GOOGLE_GENERATIVE_AI_API_KEY",
] as const;

export function loadConfig(): AgentConfig {
  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    sanityProjectId: process.env.SANITY_PROJECT_ID!,
    sanityDataset: process.env.SANITY_DATASET!,
    sanityOrgId: process.env.SANITY_ORG_ID!,
    sanityContextToken: process.env.SANITY_CONTEXT_TOKEN!,
    googleApiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY!,
  };
}

export function contextMcpUrl(config: AgentConfig): string {
  return `https://api.sanity.io/v1/context/organizations/${config.sanityOrgId}/mcp/money-flow-agent`;
}
