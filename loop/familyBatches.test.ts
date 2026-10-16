import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_BASE_STORE_DESIGN, DEFAULT_CONSTRAINTS } from "../shared/constants.js";
import { simulateSingleVariant } from "../engine/simulator.js";
import { DesignGenerationError, GEMINI_ENDPOINT } from "./boundedProposals.js";
import { createFamilyDesignGenerator } from "./familyBatches.js";

const base = () => structuredClone(DEFAULT_BASE_STORE_DESIGN);
const constraints = () => structuredClone(DEFAULT_CONSTRAINTS);
function families(batch: number) {
  return Array.from({ length: 100 }, (_, index) => {
    const ordinal = batch * 100 + index;
    return { id: `family-${ordinal}`, patches: [
      { path: "makeTimeSec", op: "set", value: 20 + ordinal },
      { path: "floorAreaM2", op: "set", value: 100 + ordinal / 10 },
    ] };
  });
}
function payload(batch: number, designs: unknown[] = families(batch)) {
  return { status: "completed", model: "gemini-4-argon",
    steps: [{ type: "model_output", content: [{ type: "text", text: JSON.stringify({ designs }) }] }],
    usage: { total_input_tokens: 100 + batch, total_output_tokens: 200 + batch } };
}
const response = (batch: number) => new Response(JSON.stringify(payload(batch)));
const generator = (fetchImpl: typeof fetch, extra = {}) => createFamilyDesignGenerator({
  fetchImpl, getApiKey: () => "TEST_ONLY_FAMILY_KEY", ...extra,
});

test("five mocked Interactions calls yield 500 unique validated families and actual measured usage", async () => {
  let calls = 0;
  let active = 0;
  let maximum = 0;
  const generate = generator(async (url, init) => {
    assert.equal(url, GEMINI_ENDPOINT);
    assert.equal(init!.redirect, "error");
    const body = JSON.parse(init!.body as string);
    assert.equal(body.store, false);
    assert.equal(body.generation_config.max_output_tokens, 20_000);
    assert.equal(body.generation_config.thinking_level, "medium");
    assert.equal("temperature" in body.generation_config, false);
    assert.equal(body.response_format.mime_type, "application/json");
    assert.equal(body.response_format.schema.properties.designs.maxItems, 100);
    assert.equal(JSON.stringify(body).includes("TEST_ONLY_FAMILY_KEY"), false);
    const index = calls++;
    maximum = Math.max(maximum, ++active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--;
    return response(index);
  });
  const frozenBase = base();
  const rules = constraints();
  const result = await generate(frozenBase, rules);
  assert.equal(result.status, "generated");
  assert.equal(result.reason, null);
  assert.equal(result.requestsCompleted, 5);
  assert.equal(result.designs.length, 500);
  assert.equal(new Set(result.designs.map((d) => d.id)).size, 500);
  assert.equal(calls, 5);
  assert.equal(maximum, 4);
  assert.equal(result.tokens.length, 5);
  assert.equal(result.tokens.reduce((sum, row) => sum + row.inputTokens, 0), 510);
  assert.equal(result.tokens.reduce((sum, row) => sum + row.outputTokens, 0), 1010);
  for (const design of [result.designs[0], result.designs[250], result.designs[499]]) {
    const sim = simulateSingleVariant(design, { id: "sample", shocks: [] }, rules);
    assert.equal(sim.constraintsOk, true);
    assert.ok(Number.isFinite(sim.cashMin));
    assert.ok(sim.months.length > 0);
    assert.deepEqual(design.deposit, frozenBase.deposit);
    assert.deepEqual(design.fitoutCost, frozenBase.fitoutCost);
    assert.equal(design.avgTicketKrw, frozenBase.avgTicketKrw);
    assert.equal(design.cupsPerDayBase, frozenBase.cupsPerDayBase);
  }
  assert.deepEqual(frozenBase, base());
  assert.deepEqual(rules, constraints());
  assert.equal(JSON.stringify(result).includes("TEST_ONLY_FAMILY_KEY"), false);
});

test("no-key, pre-cancelled and invalid-base requests use zero fetches", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => { calls++; return response(0); };
  await assert.rejects(createFamilyDesignGenerator({ fetchImpl, getApiKey: () => "" })(base(), constraints()),
    (error: unknown) => error instanceof DesignGenerationError && error.code === "UNCONFIGURED");
  const generate = generator(fetchImpl);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(generate(base(), constraints(), { signal: controller.signal }),
    (error: unknown) => error instanceof DesignGenerationError && error.code === "CANCELLED");
  await assert.rejects(generate(base(), { ...constraints(), budgetKrw: NaN }),
    (error: unknown) => error instanceof DesignGenerationError && error.code === "INVALID_INPUT");
  assert.equal(calls, 0);
});

test("duplicate IDs, duplicate parameter sets and forbidden money changes cannot make 500", async () => {
  let calls = 0;
  const generate = generator(async () => {
    const batch = calls++;
    const rows = families(batch);
    if (batch === 0) {
      rows[1] = { ...rows[0], id: "different-id-same-parameters" };
      rows[2].patches = [{ path: "avgTicketKrw", op: "set", value: 1 }];
    }
    if (batch === 1) rows[0].id = "family-0";
    return new Response(JSON.stringify(payload(batch, rows)));
  });
  const result = await generate(base(), constraints());
  assert.equal(result.status, "partial");
  assert.equal(result.designs.length, 497);
  assert.equal(result.tokens.length, 5);
  assert.equal(result.requestsCompleted, 5);
  assert.match(result.reason!, /duplicate_families_rejected/);
});

test("one failed provider request preserves the other 400 families and measured tokens", async () => {
  let calls = 0;
  const result = await generator(async () => {
    const index = calls++;
    if (index === 2) return new Response("TEST_ONLY_FAMILY_KEY", { status: 403 });
    return response(index);
  })(base(), constraints());
  assert.equal(result.status, "partial");
  assert.equal(result.designs.length, 400);
  assert.equal(result.tokens.length, 4);
  assert.equal(result.requestsCompleted, 4);
  assert.equal(calls, 5);
  assert.equal(JSON.stringify(result).includes("TEST_ONLY_FAMILY_KEY"), false);
});

test("missing usage and unfinished responses never fabricate tokens or a completed batch", async () => {
  let calls = 0;
  const result = await generator(async () => {
    const index = calls++;
    if (index === 0) return new Response(JSON.stringify({ ...payload(index), usage: {} }));
    if (index === 1) return new Response(JSON.stringify({ ...payload(index), status: "in_progress" }));
    return response(index);
  })(base(), constraints());
  assert.equal(result.status, "partial");
  assert.equal(result.designs.length, 300);
  assert.equal(result.tokens.length, 4);
  assert.equal(result.requestsCompleted, 4);
  assert.match(result.reason!, /provider_usage_unavailable/);
  assert.match(result.reason!, /provider_output_incomplete/);
});

test("one concurrent batch and one lifetime five-call budget; no retries after success", async () => {
  let calls = 0;
  const release: (() => void)[] = [];
  const generate = generator(async () => {
    const index = calls++;
    if (index < 4) await new Promise<void>((resolve) => release.push(resolve));
    return response(index);
  });
  const pending = generate(base(), constraints());
  await assert.rejects(generate(base(), constraints()),
    (error: unknown) => error instanceof DesignGenerationError && error.code === "BUSY");
  assert.equal(calls, 4);
  release.forEach((resolve) => resolve());
  assert.equal((await pending).status, "generated");
  await assert.rejects(generate(base(), constraints()),
    (error: unknown) => error instanceof DesignGenerationError && error.code === "CALL_LIMIT");
  assert.equal(calls, 5);
});

test("overall timeout bounds even an unresponsive fetch; queued fifth call is not dispatched", async () => {
  let calls = 0;
  const result = await generator(async () => {
    calls++;
    return new Promise<Response>(() => undefined);
  }, { callTimeoutMs: 100, totalTimeoutMs: 5 })(base(), constraints());
  assert.equal(result.status, "failed");
  assert.equal(result.requestsCompleted, 0);
  assert.deepEqual(result.designs, []);
  assert.deepEqual(result.tokens, []);
  assert.equal(calls, 4);
  assert.match(result.reason!, /batch_timeout/);
});

test("per-call timeout preserves successful subsets without retrying the timed-out call", async () => {
  let calls = 0;
  const result = await generator(async () => {
    const index = calls++;
    if (index === 0) return new Promise<Response>(() => undefined);
    return response(index);
  }, { callTimeoutMs: 20, totalTimeoutMs: 200 })(base(), constraints());
  assert.equal(result.status, "partial");
  assert.equal(result.designs.length, 400);
  assert.equal(result.tokens.length, 4);
  assert.equal(calls, 5);
  assert.match(result.reason!, /provider_timeout/);
});

test("oversized and malformed responses fail without fallback", async () => {
  let calls = 0;
  const result = await generator(async () => {
    return calls++ % 2 ? new Response("not json") : new Response("x".repeat(1_048_577));
  })(base(), constraints());
  assert.equal(result.status, "failed");
  assert.equal(result.designs.length, 0);
  assert.equal(result.tokens.length, 0);
  assert.equal(calls, 5);
});
