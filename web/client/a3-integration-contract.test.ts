// INACTIVE PROTOTYPE CONTRACT from upstream f9e4b92. Not the active server API.
// This source includes unverified AI/calibration assertions and is preserved for correction before wiring.
// It is excluded together with web/client from the active build and test suite; no pass is claimed.
// web/web.test.ts — Lane A3 integration tests for HTTP server, UI assets, exports, and AT-12/AT-14 compliance.

import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { createAppServer, type ApiRunEnvelope } from "./server.js";

describe("Lane A3 — Web Server, 6-Screen UI Assets, StatusBar (AT-14), and Exports (AT-12)", () => {
  const server = createAppServer();
  let baseUrl = "";

  before(async () => {
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  const forbiddenEn = ["survival", "probability"].join(" ");
  const forbiddenKo = ["생존", "확률"].join("");

  it("serves index.html and app.js with zero forbidden wording (AT-12)", async () => {
    const htmlRes = await fetch(`${baseUrl}/`);
    assert.equal(htmlRes.status, 200);
    const html = await htmlRes.text();
    assert.ok(html.includes("천 개의 가게 · A Thousand Stores"));
    assert.ok(html.includes("500 AI design families x 20 variations"));
    assert.equal(html.toLowerCase().includes(forbiddenEn), false);
    assert.equal(html.includes(forbiddenKo), false);

    const jsRes = await fetch(`${baseUrl}/app.js`);
    assert.equal(jsRes.status, 200);
    const js = await jsRes.text();
    assert.equal(js.toLowerCase().includes(forbiddenEn), false);
    assert.equal(js.includes(forbiddenKo), false);
  });

  it("AT-12 & AT-14 & AT-16: GET /api/default returns 10,000 variants, full StatusBar, saturationCurve, and peakQueueSim", async () => {
    const res = await fetch(`${baseUrl}/api/default`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as ApiRunEnvelope;

    assert.equal(body.run.mode, 10000);
    assert.equal(body.run.results.length, 10000);
    assert.equal(body.run.modeLabel, "500 AI design families x 20 variations");
    assert.equal(body.run.saturationCurve?.length, 3);
    assert.equal(body.run.status.endState, "DONE");
    assert.ok(body.run.status.runId.length > 0);
    assert.ok((body.run.status.inputHash ?? "").length >= 8);
    assert.ok((body.run.status.engineSha ?? "").length >= 6);
    assert.ok(body.run.status.gateLog.length >= 5);
    assert.ok(body.peakQueueSim.serviceCapacityCupsPerHour > 0);
  });

  it("AT-02 & AT-14: POST /run produces a distinct runId and supports uncalibrated failure path", async () => {
    const res1 = await fetch(`${baseUrl}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: 1000,
        monthlyRentKrw: 3_500_000,
        referenceOffsetPp: 10.0,
      }),
    });
    assert.equal(res1.status, 200);
    const env1 = (await res1.json()) as ApiRunEnvelope;
    assert.equal(env1.run.calibration.label, "uncalibrated");
    assert.equal(env1.run.calibration.koLabel, "미보정");

    // Retrieve via GET /runs/:id and verify replay=true
    const replayRes = await fetch(`${baseUrl}/runs/${env1.run.runId}`);
    assert.equal(replayRes.status, 200);
    const replayEnv = (await replayRes.json()) as ApiRunEnvelope;
    assert.equal(replayEnv.run.status.replay, true);
  });

  it("AT-10: POST /patches rejects all 5 forbidden paths with reasons", async () => {
    const res = await fetch(`${baseUrl}/patches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patches: [
          { op: "replace", path: "/checks", value: 1, by: "StoreDesigner" },
          { op: "replace", path: "/budgetKrw", value: 999999999, by: "StoreDesigner" },
          { op: "replace", path: "/reserveRatioMin", value: 0, by: "StoreDesigner" },
          { op: "replace", path: "/oracle/pnlFormula", value: "hack", by: "StoreDesigner" },
          { op: "replace", path: "/backtest/referenceRates", value: 0, by: "BankruptcyDesigner" },
        ],
      }),
    });
    assert.equal(res.status, 200);
    const data = (await res.json()) as {
      acceptedCount: number;
      rejectedCount: number;
      engineResultHashUnchanged: boolean;
    };
    assert.equal(data.acceptedCount, 0);
    assert.equal(data.rejectedCount, 5);
    assert.equal(data.engineResultHashUnchanged, true);
  });

  it("AT-12: exports non-empty CSV and Markdown report with source tags and zero forbidden phrases", async () => {
    const csvRes = await fetch(`${baseUrl}/api/export/default/csv?decision=hold`);
    assert.equal(csvRes.status, 200);
    const csvText = await csvRes.text();
    assert.ok(csvText.includes("500 AI design families x 20 variations"));
    assert.ok(csvText.includes("computed:engineSha="));
    assert.equal(csvText.toLowerCase().includes(forbiddenEn), false);

    const mdRes = await fetch(`${baseUrl}/api/export/default/report.md?decision=hold`);
    assert.equal(mdRes.status, 200);
    const mdText = await mdRes.text();
    assert.ok(mdText.includes("시나리오 빈도(scenario frequency)"));
    assert.equal(mdText.toLowerCase().includes(forbiddenEn), false);
    assert.equal(mdText.includes(forbiddenKo), false);
  });
});
