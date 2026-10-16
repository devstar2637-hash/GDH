// engine/cli.ts — CLI entry point for backtest, bench, baseline, adversarial, secrets-scan, and accept.

import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  DEFAULT_BASE_STORE_DESIGN,
  DEFAULT_CONSTRAINTS,
} from "../shared/constants.js";
import type { StoreDesign } from "../shared/types.js";
import { runBacktestGate } from "./backtest.js";
import { generateStructuredStoreDesigns } from "./baseline.js";
import { evaluateLeaderAtAssumptionDelta } from "./cliff.js";
import { expandDesignFamiliesTo10k } from "./landscape.js";
import { runOrchestration } from "./orchestrator.js";
import { sha256Canonical } from "./prng.js";
import { simulateBatch } from "./simulator.js";

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function walkFiles(dir: string, ignoreDirs = new Set(["node_modules", ".git", "runs", "raw"])): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (ignoreDirs.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walkFiles(full, ignoreDirs));
    } else if (st.isFile()) {
      out.push(full);
    }
  }
  return out;
}

export function runSecretsScan(repoRoot = process.cwd()): {
  passed: boolean;
  findings: string[];
} {
  const findings: string[] = [];
  const files = walkFiles(repoRoot);
  // Real Google API key pattern: AIzaSy followed by 33 base64url chars
  const keyRegex = /AIzaSy[0-9A-Za-z_-]{33}/g;

  for (const file of files) {
    if (file.endsWith(".png") || file.endsWith(".jpg") || file.endsWith(".zip")) continue;
    const content = readFileSync(file, "utf8");
    const matches = content.match(keyRegex);
    if (matches && matches.length > 0) {
      findings.push(`Leaked API key pattern in ${file}`);
    }
  }

  return {
    passed: findings.length === 0,
    findings,
  };
}

async function main() {
  const cmd = process.argv[2] ?? "backtest";
  const argN = process.argv.find((a) => a.startsWith("--n="));
  const nVal = argN ? Number(argN.split("=")[1]) : undefined;

  if (cmd === "backtest") {
    const cal = runBacktestGate();
    console.log(JSON.stringify(cal, null, 2));
    if (cal.label !== "calibrated" || (cal.errorPp ?? 99) > 5.0 || (cal.holdoutErrorPp ?? 99) > 5.0) {
      process.exitCode = 1;
    }
    return;
  }

  if (cmd === "bench") {
    const mode = nVal === 1000 ? 1000 : 10000;
    const base = DEFAULT_BASE_STORE_DESIGN;
    const constraints = DEFAULT_CONSTRAINTS;
    const designs =
      mode === 10000
        ? expandDesignFamiliesTo10k(
            generateStructuredStoreDesigns(base, constraints, 500),
            constraints,
            20
          )
        : generateStructuredStoreDesigns(base, constraints, 1000);

    const scenario = {
      id: "bench-scenario",
      shocks: [
        {
          id: "s1",
          kind: "offseason" as const,
          startMonth: 2,
          durationMonths: 3,
          magnitude: 0.15,
        },
      ],
    };

    const durationsMs: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      simulateBatch(designs, scenario, constraints, {
        keepAllMonths: mode === 1000,
        sampleMonthLimit: 30,
      });
      const elapsed = Number((performance.now() - t0).toFixed(2));
      durationsMs.push(elapsed);
    }

    const medMs = Number(median(durationsMs).toFixed(2));
    const report = {
      variants: designs.length,
      months: 36,
      runs: 5,
      durationsMs,
      medianMs: medMs,
      medianSec: Number((medMs / 1000).toFixed(4)),
      passed: medMs <= 2000,
    };
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
    return;
  }

  if (cmd === "baseline") {
    const res = runOrchestration({ mode: 10000, persistToDisk: false });
    console.log(JSON.stringify(res.baseline, null, 2));
    if (!res.baseline || res.baseline.label !== "ai-native") {
      process.exitCode = 1;
    }
    return;
  }

  if (cmd === "adversarial") {
    const res = runOrchestration({
      runId: "run-adversarial-cli",
      mode: 10000,
      runAdversarial: true,
      persistToDisk: true,
    });
    console.log(
      JSON.stringify(
        {
          runId: res.runId,
          roundsCount: res.rounds.length,
          rounds: res.rounds,
        },
        null,
        2
      )
    );
    if (res.rounds.length === 0 || res.rounds.length > 3) {
      process.exitCode = 1;
    }
    return;
  }

  if (cmd === "secrets-scan") {
    const scan = runSecretsScan();
    console.log(JSON.stringify(scan, null, 2));
    if (!scan.passed) process.exitCode = 1;
    return;
  }

  if (cmd === "accept") {
    // 1. Run any external verifier acceptance tests in tests/accept if present
    const acceptDir = resolve(process.cwd(), "tests/accept");
    if (existsSync(acceptDir)) {
      const testFiles = readdirSync(acceptDir).filter(
        (f) => f.endsWith(".test.ts") || f.endsWith(".test.js")
      );
      if (testFiles.length > 0) {
        execSync("node --import tsx --test tests/accept/*.test.*", {
          stdio: "inherit",
        });
      }
    }

    // 2. Built-in AT-01..AT-16 verification summary
    const calOk = runBacktestGate();
    const calBad = runBacktestGate({ referenceOffsetPp: 10.0 });
    const injectedViolations: StoreDesign[] = [
      { ...DEFAULT_BASE_STORE_DESIGN, id: "bad-budget", fitoutCost: { value: 95_000_000, source: { kind: "onsite" } } },
      { ...DEFAULT_BASE_STORE_DESIGN, id: "bad-reserve", fitoutCost: { value: 82_000_000, source: { kind: "onsite" } } },
      { ...DEFAULT_BASE_STORE_DESIGN, id: "bad-seats", seats: -2 },
      { ...DEFAULT_BASE_STORE_DESIGN, id: "bad-area", floorAreaM2: 0 },
      { ...DEFAULT_BASE_STORE_DESIGN, id: "bad-both", seats: -1, floorAreaM2: -5 },
    ];
    const run1 = runOrchestration({
      runId: "accept-1k",
      mode: 1000,
      injectedDesigns: injectedViolations,
      persistToDisk: true,
    });
    const run2 = runOrchestration({
      runId: "accept-1k",
      mode: 1000,
      injectedDesigns: injectedViolations,
      persistToDisk: false,
    });
    const hash1 = sha256Canonical(run1.results);
    const hash2 = sha256Canonical(run2.results);

    // AT-07 cliff check
    let cliffFlips = false;
    if (run1.cliff && run1.cliff.relativeDelta !== undefined) {
      const validDesigns = run1.designs.filter((_, i) => run1.results[i]?.constraintsOk).slice(0, 120);
      const step = 0.03;
      const dBelow = run1.cliff.relativeDelta - step;
      const dAbove = run1.cliff.relativeDelta + step;
      const lBelow = evaluateLeaderAtAssumptionDelta(
        run1.cliff.variable as "makeTimeSec",
        dBelow,
        validDesigns,
        DEFAULT_BASE_STORE_DESIGN,
        run1.scenarios[0],
        run1.constraints
      );
      const lAbove = evaluateLeaderAtAssumptionDelta(
        run1.cliff.variable as "makeTimeSec",
        dAbove,
        validDesigns,
        DEFAULT_BASE_STORE_DESIGN,
        run1.scenarios[0],
        run1.constraints
      );
      cliffFlips = Boolean(lBelow && lAbove && lBelow !== lAbove);
    }

    // AT-16 10,000 variants mode check (default)
    const run10k = runOrchestration({
      runId: "accept-10k",
      mode: 10000,
      runAdversarial: false,
      persistToDisk: false,
    });

    const summary = {
      "AT-01_backtest_calibrated": calOk.label === "calibrated" && (calOk.errorPp ?? 99) <= 5.0,
      "AT-02_backtest_uncalibrated": calBad.label === "uncalibrated",
      "AT-03_constraints_rejected_5": run1.rejectedCount === 5,
      "AT-04_independent_pnl_1krw": run1.status.gateLog.find((g) => g.gate === "pnl_recompute")?.passed === true,
      "AT-05_speed_1k_under_2s": (run1.computeMs ?? 9999) <= 2000,
      "AT-06_reproducible_hash": hash1 === hash2,
      "AT-07_single_cliff_flips_leader": cliffFlips,
      "AT-08_next_measurement_matches_cliff":
        run1.nextMeasurement?.variable === run1.cliff?.variable,
      "AT-09_baseline_comparison": run1.baseline?.label === "ai-native",
      "AT-11_secrets_scan": runSecretsScan().passed,
      "AT-12_no_forbidden_phrases": walkFiles(resolve(process.cwd(), "web")).every(
        (f) =>
          !f.endsWith(".html") && !f.endsWith(".ts")
            ? true
            : !readFileSync(f, "utf8").includes("생존확률") &&
              !readFileSync(f, "utf8").toLowerCase().includes("survival probability")
      ),
      "AT-13_adversarial_rounds_logged":
        run1.rounds.length >= 1 && run1.rounds.length <= 3,
      "AT-14_status_bar_complete":
        Boolean(run1.status.runId) &&
        Boolean(run1.status.inputHash) &&
        Boolean(run1.status.engineSha) &&
        run1.status.endState === "DONE",
      "AT-15_holdout_under_5pp": (calOk.holdoutErrorPp ?? 99) <= 5.0,
      "AT-16_10k_mode_under_2s":
        run10k.results.length === 10000 &&
        (run10k.computeMs ?? 9999) <= 2000 &&
        run10k.modeLabel === "500 AI design families x 20 variations",
    };

    console.log(JSON.stringify(summary, null, 2));
    const allPassed = Object.values(summary).every(Boolean);
    if (!allPassed) {
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
