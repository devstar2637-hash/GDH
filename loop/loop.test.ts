import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_BASE_STORE_DESIGN, DEFAULT_CONSTRAINTS } from "../shared/constants.js";
import { simulateSingleVariant } from "../engine/simulator.js";
import { createDesignGenerator, DesignGenerationError, GEMINI_ENDPOINT, validatePatchBundle } from "./index.js";

const base = () => structuredClone(DEFAULT_BASE_STORE_DESIGN);
const constraints = () => structuredClone(DEFAULT_CONSTRAINTS);
const bundle = (path = "seats", value = 18, id = "ai-one") => ({ id, patches: [{ path, op: "set", value }] });
const payload = (designs: unknown[] = [bundle()]) => ({
  status: "completed", model: "gemini-4-argon",
  steps: [{ type: "model_output", content: [{ type: "text", text: JSON.stringify({ designs }) }] }],
  usage: { total_input_tokens: 113, total_output_tokens: 71 },
});
const response = (body: unknown = payload(), status = 200) => new Response(JSON.stringify(body), { status });
const configured = (fetchImpl: typeof fetch, extra = {}) => createDesignGenerator({
  fetchImpl, getApiKey: () => "TEST_ONLY_SECRET_SENTINEL", ...extra,
});

test("structural patch applies on a clone; all fixed financial assumptions remain unchanged", () => {
  const input = base();
  const frozen = JSON.stringify(input);
  const rules = constraints();
  const checked = validatePatchBundle(bundle(), input, rules);
  assert.equal(checked.valid, true);
  if (!checked.valid) return;
  assert.equal(checked.design.seats, 18);
  for (const field of ["deposit", "monthlyRent", "fitoutCost", "avgTicketKrw", "cogsRatio", "cupsPerDayBase", "equipmentKrw"] as const) {
    assert.deepEqual(checked.design[field], input[field]);
  }
  assert.equal(JSON.stringify(input), frozen);
  assert.deepEqual(rules, constraints());
});

test("rejects financial, oracle, slash, nested and prototype paths without pollution", () => {
  for (const path of ["budgetKrw", "reserveRatioMin", "horizonMonths", "avgTicketKrw", "deposit.value", "monthlyRent", "Gate.passed", "tests/expected", "/seats", "store.seats", "__proto__", "constructor.prototype.polluted"]) {
    assert.equal(validatePatchBundle(bundle(path), base(), constraints()).valid, false, path);
  }
  const malicious = JSON.parse('{"id":"x","patches":[{"path":"seats","op":"set","value":18,"__proto__":{"polluted":true}}]}');
  assert.equal(validatePatchBundle(malicious, base(), constraints()).valid, false);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test("rejects nonfinite, strings, fractional integers, invalid area, duplicate and oversized patches", () => {
  for (const value of [NaN, Infinity, -1, 501, 1.5, "18", null, {}]) {
    assert.equal(validatePatchBundle({ id: "x", patches: [{ path: "seats", op: "set", value }] }, base(), constraints()).valid, false);
  }
  assert.equal(validatePatchBundle(bundle("floorAreaM2", 1), base(), constraints()).valid, false);
  const duplicate = { id: "x", patches: [bundle().patches[0], bundle().patches[0]] };
  assert.equal(validatePatchBundle(duplicate, base(), constraints()).valid, false);
  assert.equal(validatePatchBundle({ id: "x", patches: Array(5).fill(bundle().patches[0]) }, base(), constraints()).valid, false);
  assert.equal(validatePatchBundle(bundle("seats", base().seats), base(), constraints()).valid, false);
});

test("unconfigured and invalid requests make no network calls", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => { calls++; return response(); };
  await assert.rejects(createDesignGenerator({ fetchImpl, getApiKey: () => "" })(base(), constraints()), (e: unknown) => e instanceof DesignGenerationError && e.code === "UNCONFIGURED");
  const generate = configured(fetchImpl);
  await assert.rejects(generate(base(), constraints(), { maxDesigns: 5 }), /one and four/);
  await assert.rejects(generate(base(), { ...constraints(), budgetKrw: NaN }), /Valid base/);
  assert.equal(calls, 0);
});

test("mock I/O covers official request format, actual usage and validated design to engine", async () => {
  let request: RequestInit | undefined;
  const generate = configured(async (url, init) => {
    assert.equal(url, GEMINI_ENDPOINT);
    request = init;
    return response();
  });
  const result = await generate(base(), constraints(), { maxDesigns: 1 });
  assert.equal(result.status, "generated");
  assert.equal(result.designs.length, 1);
  assert.deepEqual(result.tokens, [{ model: "gemini-4-argon", call: "gemini-call-1", inputTokens: 113, outputTokens: 71 }]);
  const body = JSON.parse(request!.body as string);
  assert.equal(body.model, "gemini-4-argon");
  assert.equal(body.store, false);
  assert.equal(body.response_format.mime_type, "application/json");
  assert.equal(body.generation_config.max_output_tokens, 1200);
  assert.equal(request!.redirect, "error");
  assert.equal((request!.headers as Record<string, string>)["x-goog-api-key"], "TEST_ONLY_SECRET_SENTINEL");
  assert.equal(JSON.stringify(body).includes("TEST_ONLY_SECRET_SENTINEL"), false);
  assert.equal(JSON.stringify(result).includes("TEST_ONLY_SECRET_SENTINEL"), false);
  const sim = simulateSingleVariant(result.designs[0], { id: "no-shocks", shocks: [] }, constraints());
  assert.equal(sim.constraintsOk, true);
  assert.equal(sim.designId, "ai-one");
  assert.ok(sim.months.length > 0);
  assert.ok(Number.isFinite(sim.cashMin));
});

test("rejects invalid candidates, preserves valid subset and usage without fake repairs", async () => {
  const generate = configured(async () => response(payload([bundle(), bundle("budgetKrw", 1, "bad"), bundle("seats", 18, "duplicate")] )));
  const result = await generate(base(), constraints(), { maxDesigns: 3 });
  assert.equal(result.status, "partial");
  assert.deepEqual(result.designs.map((d) => d.id), ["ai-one"]);
  assert.equal(result.tokens.length, 1);
});

test("provider errors expose generic reasons and never return a synthetic AI design", async () => {
  const cases = [
    async () => response({ error: "TEST_ONLY_SECRET_SENTINEL" }, 403),
    async () => { throw new Error("TEST_ONLY_SECRET_SENTINEL"); },
    async () => response({ ...payload(), status: "in_progress" }),
    async () => response({ ...payload(), usage: {} }),
    async () => response(payload([bundle("reserveRatioMin", 0)])),
    async () => new Response("x".repeat(70_000)),
  ];
  for (const fetchImpl of cases) {
    const result = await configured(fetchImpl)(base(), constraints());
    assert.equal(result.status, "failed");
    assert.deepEqual(result.designs, []);
    assert.equal(JSON.stringify(result).includes("TEST_ONLY_SECRET_SENTINEL"), false);
  }
});

test("one in-flight request and hard four-call quota are enforced before fetch", async () => {
  let release!: (response: Response) => void;
  let calls = 0;
  const generate = configured(async () => {
    calls++;
    if (calls === 1) return new Promise<Response>((resolve) => { release = resolve; });
    return response();
  });
  const first = generate(base(), constraints());
  await assert.rejects(generate(base(), constraints()), (e: unknown) => e instanceof DesignGenerationError && e.code === "BUSY");
  release(response());
  await first;
  for (let i = 0; i < 3; i++) await generate(base(), constraints());
  await assert.rejects(generate(base(), constraints()), (e: unknown) => e instanceof DesignGenerationError && e.code === "CALL_LIMIT");
  assert.equal(calls, 4);
});

test("timeout and external cancellation stop I/O and release the single-flight guard", async () => {
  let attempts = 0;
  const generate = configured(async (_url, init) => {
    if (++attempts > 1) return response();
    return new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
  }, { timeoutMs: 15 });
  const result = await generate(base(), constraints());
  assert.equal(result.reason, "provider_timeout");
  assert.deepEqual(result.designs, []);
  assert.equal((await generate(base(), constraints())).status, "generated");
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(generate(base(), constraints(), { signal: controller.signal }), (e: unknown) => e instanceof DesignGenerationError && e.code === "CANCELLED");
});
