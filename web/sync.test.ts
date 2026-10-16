import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import { createAppServer } from "./server.js";

const server = createAppServer();
let base: string;
before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
});
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("deployed UI serves versioned JavaScript and stylesheet at its advertised paths", async () => {
  const html = await (await fetch(base)).text();
  const version = html.match(/name="ui-build" content="([a-f0-9]+)"/)?.[1];
  assert.ok(version, "build the client before testing the deployed asset contract");
  for (const asset of ["/app.js", "/styles.css"]) {
    const response: Response = await fetch(base + asset + "?v=" + version);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", asset.endsWith(".js") ? /javascript/ : /text\/css/);
    assert.ok((await response.text()).length > 1000);
  }
  const health = await (await fetch(base + "/api/health")).json() as { uiBuild: string };
  assert.equal(health.uiBuild, version);
});

test("compact summary contains the same 10,000 oracle outcomes without monthly histories", async () => {
  const summaryResponse = await fetch(base + "/api/summary");
  const summaryText = await summaryResponse.text();
  const summary = JSON.parse(summaryText);
  const full = await (await fetch(base + "/api/default")).json() as any;
  assert.equal(summary.run.runId, full.run.runId);
  assert.equal(summary.run.results.length, 10000);
  assert.deepEqual(summary.run.results, full.run.results.map(
    ({ constraintsOk, deathMonth, survivedMonths }: any) => ({ constraintsOk, deathMonth, survivedMonths })
  ));
  assert.ok(summaryText.length < JSON.stringify(full).length / 5);
});

test("AI Studio rehearsal alias supports compact fresh executions", async () => {
  const response = await fetch(base + "/api/rehearse?summary=1", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: 1000 }),
  });
  assert.equal(response.status, 200);
  const data = await response.json() as any;
  assert.equal(data.run.results.length, 1000);
  assert.equal(data.run.status.replay, false);
  assert.equal(data.run.results[0].months, undefined);
});
