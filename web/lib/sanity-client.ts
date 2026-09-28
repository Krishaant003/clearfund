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
  // @sanity/client retries 429/502/503 internally by default (maxRetries: 5).
  // withBackoff is the one deliberate retry layer; disable the client's own
  // so a sustained 429 doesn't trigger both layers stacked (~24 attempts).
  maxRetries: 0,
});

export async function sanityQuery<T>(groqQuery: string, params: Record<string, unknown> = {}): Promise<T> {
  return withBackoff(() => sanityClient.fetch<T>(groqQuery, params));
}
