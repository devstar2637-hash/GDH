// engine/cli.contract.test.ts — CLI run contract, outlay, and shared/ quarter boundary.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { DEFAULT_BASE_STORE_DESIGN, DEFAULT_CONSTRAINTS } from "../shared/constants.js";
import type { RunResult, StatusBar, StoreDesign } from "../shared/types.js";
import { checkStoreConstraints, outlayKrw } from "./constraints.js";

const HOLDOUT_QUARTER_IDS =
  /(?<![0-9])(20251|20252|20253|20254|20261|20262|2025Q[1-4]|2026Q[12])(?![0-9])/;

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listFiles(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

function assertStatusBar(status: StatusBar, inputPath: string): void {
  assert.equal(typeof status.runId, "string");
  assert.ok(status.runId.length > 0);
  assert.ok(Array.isArray(status.inputFiles));
  assert.ok(status.inputFiles.includes(inputPath));
  assert.equal(status.inputHash?.length, 8);
  assert.equal(typeof status.engineSha, "string");
  assert.ok((status.engineSha ?? "").length >= 7);
  assert.ok(
    status.endState === "DONE" || status.endState === "FAIL" || status.endState === "BLOCKED"
  );
  assert.equal(typeof status.replay, "boolean");
  assert.ok(Array.isArray(status.tokens));
  assert.equal(typeof status.tokenTotal.input, "number");
  assert.equal(typeof status.tokenTotal.output, "number");
  assert.ok(status.tokenTotal.input >= 0);
  assert.ok(status.tokenTotal.output >= 0);
  assert.ok(Array.isArray(status.gateLog) && status.gateLog.length > 0);
  for (const gate of status.gateLog) {
    assert.equal(typeof gate.gate, "string");
    assert.ok(gate.passed === true || gate.passed === false || gate.passed === null);
    assert.equal(typeof gate.detail, "string");
    assert.equal(typeof gate.at, "string");
  }
}

describe("CLI contract", () => {
  it("outlay is deposit + fitoutCost and ignores equipment, rent, and wages", () => {
    const design: StoreDesign = {
      ...DEFAULT_BASE_STORE_DESIGN,
      deposit: { value: 40_000_000, source: { kind: "onsite" } },
      fitoutCost: { value: 50_000_000, source: { kind: "onsite" } },
      equipmentKrw: 80_000_000,
      monthlyRent: { value: 9_000_000, source: { kind: "onsite" } },
      wagePerStaffKrw: 8_000_000,
    };
    assert.equal(outlayKrw(design), 90_000_000);

    const withOtherCosts: StoreDesign = {
      ...design,
      equipmentKrw: 500_000_000,
      monthlyRent: { value: 40_000_000, source: design.monthlyRent.source },
      wagePerStaffKrw: 12_000_000,
    };
    assert.equal(outlayKrw(withOtherCosts), outlayKrw(design));

    const withinBudget = checkStoreConstraints(withOtherCosts, DEFAULT_CONSTRAINTS);
    assert.equal(withinBudget.ok, true);
    assert.equal(withinBudget.initialInvestmentKrw, 90_000_000);
    assert.equal(withinBudget.initialCashKrw, DEFAULT_CONSTRAINTS.budgetKrw - 90_000_000);

    const fitoutPushesOver: StoreDesign = {
      ...design,
      fitoutCost: { value: 90_000_000, source: design.fitoutCost.source },
      equipmentKrw: 0,
    };
    assert.equal(outlayKrw(fitoutPushesOver), 130_000_000);
    assert.equal(checkStoreConstraints(fitoutPushesOver, DEFAULT_CONSTRAINTS).ok, false);
  });

  it("shared/ contains no holdout quarter ids", () => {
    const files = listFiles(join(process.cwd(), "shared"));
    assert.ok(files.length > 0);
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      assert.equal(
        HOLDOUT_QUARTER_IDS.test(text),
        false,
        `${file} contains a holdout quarter id`
      );
    }
  });

  it("npx tsx engine/cli.ts run writes result.json for the RunResult contract", () => {
    const work = mkdtempSync(join(tmpdir(), "cli-contract-"));
    const inputPath = join(work, "input.json");
    const outDir = join(work, "out");
    const violating: StoreDesign = {
      ...DEFAULT_BASE_STORE_DESIGN,
      id: "viol-outlay",
      deposit: { value: 40_000_000, source: { kind: "onsite" } },
      fitoutCost: { value: 90_000_000, source: { kind: "onsite" } },
      equipmentKrw: 1,
    };
    writeFileSync(
      inputPath,
      JSON.stringify({
        district: "성수동",
        budgetKrw: 120_000_000,
        seed: 1,
        depositKrw: 35_000_000,
        monthlyRentKrw: 3_200_000,
        fitoutCostKrw: 62_000_000,
        injectedDesigns: [violating],
      })
    );

    const proc = spawnSync(
      "npx",
      [
        "tsx",
        "engine/cli.ts",
        "run",
        "--input",
        inputPath,
        "--seed",
        "42",
        "--n",
        "50",
        "--out",
        outDir,
      ],
      { cwd: process.cwd(), encoding: "utf8" }
    );
    assert.equal(proc.status, 0, `${proc.stdout}\n${proc.stderr}`);

    const written = JSON.parse(readFileSync(join(outDir, "result.json"), "utf8")) as RunResult;
    assert.equal(written.constraints.seed, 42);
    assert.ok(Array.isArray(written.designs));
    assert.equal(written.designs.length, 51);
    assert.equal(written.results.length, written.designs.length);

    const rejected = written.results.filter((row) => row.constraintsOk === false);
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0]?.designId, "viol-outlay");
    assert.equal(rejected[0]?.deathMonth, null);
    assert.ok(Array.isArray(rejected[0]?.months));
    assert.ok(written.designs.some((design) => design.id === "viol-outlay"));

    const accepted = written.results.filter((row) => row.constraintsOk);
    assert.ok(accepted.length >= 50);
    for (const row of accepted) {
      assert.ok(row.months.length > 0, `${row.designId} is missing month rows`);
      if (row.deathMonth === null) {
        assert.equal(row.months.length, written.constraints.horizonMonths);
      } else {
        assert.equal(row.months.length, row.deathMonth);
      }
    }

    assert.equal(typeof written.leaderDesignId, "string");
    assert.ok(
      accepted.some((row) => row.designId === written.leaderDesignId),
      "leaderDesignId must name a constraints-ok result"
    );
    assert.ok(written.cliff, "expected a cliff");
    assert.equal(typeof written.cliff.relativeDelta, "number");
    assert.ok(Number.isFinite(written.cliff.relativeDelta));
    assertStatusBar(written.status, inputPath);
    assert.equal(written.status.endState, "DONE");
  });
});
