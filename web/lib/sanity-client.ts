import { createClient } from "@sanity/client";
import { withBackoff } from "./with-backoff.ts";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const sanityClient = createClient({
  projectId: requireEnv("SANITY_PROJECT_ID"),
  dataset: requireEnv("SANITY_DATASET"),
  token: requireEnv("SANITY_READ_TOKEN"),
  apiVersion: "2026-09-28",
  useCdn: false,
});

export async function sanityQuery<T>(groqQuery: string, params: Record<string, unknown> = {}): Promise<T> {
  return withBackoff(() => sanityClient.fetch<T>(groqQuery, params));
}
