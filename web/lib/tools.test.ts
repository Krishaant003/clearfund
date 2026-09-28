import { test } from "node:test";
import assert from "node:assert/strict";
import { tools } from "./tools.ts";

const SVCF_EIN = "205205488";
const FIDELITY_EIN = "110303001";

test("getGrantsByFunder returns grants with citations for SVCF", async () => {
  const result = await tools.getGrantsByFunder.execute({ ein: SVCF_EIN });
  assert.ok(result.length > 0);
  for (const grant of result) {
    assert.ok(grant.sourceObjectId, "every grant must have a sourceObjectId citation");
    assert.ok(grant.recipient.ein);
  }
});

test("getGrantsByRecipient returns grants for Fidelity Charitable", async () => {
  const result = await tools.getGrantsByRecipient.execute({ ein: FIDELITY_EIN });
  assert.ok(result.length > 0);
  for (const grant of result) {
    assert.ok(grant.sourceObjectId);
    assert.ok(grant.funder.ein);
  }
});

test("findIntermediaries includes Fidelity Charitable", async () => {
  const result = await tools.findIntermediaries.execute({});
  const eins = result.map((org) => org.ein);
  assert.ok(eins.includes(FIDELITY_EIN));
});

test("traceChain from SVCF produces a multi-hop chain with citations", async () => {
  const result = await tools.traceChain.execute({ startingEin: SVCF_EIN, maxHops: 3 });
  assert.ok(result.hops.length > 0);
  assert.equal(result.hops[0].funder.ein, SVCF_EIN);
  for (const hop of result.hops) {
    assert.ok(hop.sourceObjectId);
  }
});

test("traceChain on an EIN with no grants returns an empty chain, not a throw", async () => {
  const result = await tools.traceChain.execute({ startingEin: "000000000", maxHops: 3 });
  assert.deepEqual(result.hops, []);
  assert.equal(result.endedReason, "no_further_grants");
});
