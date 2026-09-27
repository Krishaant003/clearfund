import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig, contextMcpUrl } from "./config.ts";

const REQUIRED_KEYS = [
  "SANITY_PROJECT_ID",
  "SANITY_DATASET",
  "SANITY_ORG_ID",
  "SANITY_CONTEXT_TOKEN",
  "GOOGLE_GENERATIVE_AI_API_KEY",
];

function withEnv(vars: Record<string, string>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const key of REQUIRED_KEYS) saved[key] = process.env[key];
  for (const key of REQUIRED_KEYS) delete process.env[key];
  Object.assign(process.env, vars);
  try {
    fn();
  } finally {
    for (const key of REQUIRED_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

test("throws a named error when a required env var is missing", () => {
  withEnv({}, () => {
    assert.throws(() => loadConfig(), /Missing required environment variable: SANITY_PROJECT_ID/);
  });
});

test("returns a config object when all required env vars are set", () => {
  withEnv(
    {
      SANITY_PROJECT_ID: "test-project",
      SANITY_DATASET: "production",
      SANITY_ORG_ID: "test-org",
      SANITY_CONTEXT_TOKEN: "test-token",
      GOOGLE_GENERATIVE_AI_API_KEY: "test-key",
    },
    () => {
      const config = loadConfig();
      assert.equal(config.sanityProjectId, "test-project");
      assert.equal(config.googleApiKey, "test-key");
    }
  );
});

test("contextMcpUrl matches the spec's org-level endpoint pattern", () => {
  withEnv(
    {
      SANITY_PROJECT_ID: "test-project",
      SANITY_DATASET: "production",
      SANITY_ORG_ID: "test-org",
      SANITY_CONTEXT_TOKEN: "test-token",
      GOOGLE_GENERATIVE_AI_API_KEY: "test-key",
    },
    () => {
      const config = loadConfig();
      assert.equal(
        contextMcpUrl(config),
        "https://api.sanity.io/v1/context/organizations/test-org/mcp/money-flow-agent"
      );
    }
  );
});
