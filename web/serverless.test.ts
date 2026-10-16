import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { createAppServer } from "./server.js";

describe("portable serverless engine", () => {
  const server = createAppServer({ persistToDisk: false, compactResponses: true, engineSha: "abc12345" });
  let baseUrl: string;
  before(async () => {
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => {
    await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
  });

  it("runs 10,000 scenarios without disk writes or an oversized response", async () => {
    const response = await fetch(`${baseUrl}/api/rehearse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: 10000, monthlyRentKrw: 3420123 }),
    });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.ok(Buffer.byteLength(text) < 4_500_000);
    const envelope = JSON.parse(text);
    assert.equal(envelope.responseShape, "summary");
    assert.equal(envelope.run.results.length, 10000);
    assert.equal(envelope.run.status.endState, "DONE");
    assert.equal(envelope.run.status.replay, false);
    assert.equal(envelope.run.status.engineSha, "abc12345");
    assert.equal(existsSync(resolve("runs", envelope.run.runId)), false);
    assert.ok(envelope.run.status.gateLog.length >= 5);
    const replay = await fetch(`${baseUrl}/api/runs/${envelope.run.runId}`);
    assert.equal((await replay.json()).run.status.replay, true);
  });

  it("marks cached defaults as replay and preserves small exports", async () => {
    const response = await fetch(`${baseUrl}/api/default`);
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.ok(Buffer.byteLength(text) < 4_500_000);
    const envelope = JSON.parse(text);
    assert.equal(envelope.run.status.replay, true);
    assert.equal(envelope.run.results.length, 10000);
    const csv = await fetch(`${baseUrl}/api/export/default/csv`);
    assert.equal(csv.status, 200);
    assert.match(await csv.text(), /computed:engineSha=abc12345/);
  });

  it("does not substitute a default result for an unavailable run", async () => {
    for (const path of ["/api/runs/missing-run", "/api/export/missing-run/csv"]) {
      const response = await fetch(baseUrl + path);
      assert.equal(response.status, 404);
      assert.equal((await response.json()).error, "RUN_NOT_FOUND");
    }
  });
});
