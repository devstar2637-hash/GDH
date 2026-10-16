// tests/accept/loop_security.test.ts — verifier-owned. AT-09, AT-10, AT-11, AT-12, AT-13, AT-14, AT-16 (+ V-03, V-04).
// Screen/URL parts are BLOCKED until VERIFY_URL is set to the deployed Cloud Run URL (G2).

import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import {
  countDistinctFailureFamilies,
  generateStructuredStoreDesigns,
  expandDesignFamiliesTo10k,
  markParetoNonDominated,
  runOrchestration,
  simulateBatch,
} from "../../engine/index.js";
import { createPrng, randInt, randRange } from "../../engine/prng.js";
import { validateAndApplyPatchBundles } from "../../loop/validator.js";
import type { Patch, StoreDesign, VariantPatchBundle } from "../../shared/types.js";
import { record } from "../lib/judge.js";
import { independentConstraintCheck } from "../lib/ledger.js";
import { FIXED_BASE, FIXED_CONSTRAINTS, FIXED_SCENARIO, gitShortSha, sha256 } from "../lib/fixed_input.js";

const SHA = gitShortSha();
const ROOT = process.cwd();
const URL = process.env.VERIFY_URL ?? "";

function digest(run: ReturnType<typeof runOrchestration>): string {
  return sha256(run.results.map((r) => [r.designId, r.constraintsOk, r.survivedMonths, r.deathMonth, Math.round(r.cumPnL ?? 0), Math.round(r.cashMin), r.failureFamily]));
}

/** Honest random baseline: uniform over the SAME design space the structured generator spans, same seed family, same N. */
function honestRandomDesigns(n: number, seed: number): StoreDesign[] {
  const prng = createPrng((seed ^ 0x5bd1e995) >>> 0);
  const out: StoreDesign[] = [];
  let i = 0;
  while (out.length < n && i < n * 20) {
    i++;
    const area = +randRange(prng, 16, 95).toFixed(1);
    const seats = Math.min(Math.floor(area * 1.8), randInt(prng, 2, 55));
    const d: StoreDesign = {
      ...FIXED_BASE,
      id: `hr-${String(out.length + 1).padStart(5, "0")}`, familyId: `hr-fam-${String(Math.floor(out.length / 20) + 1).padStart(3, "0")}`,
      seats, floorAreaM2: area,
      deposit: { value: randInt(prng, 15, 52) * 1_000_000, source: FIXED_BASE.deposit.source },
      fitoutCost: { value: randInt(prng, 20, 82) * 1_000_000, source: FIXED_BASE.fitoutCost.source },
      monthlyRent: { value: randInt(prng, 16, 78) * 100_000, source: FIXED_BASE.monthlyRent.source },
      staffFte: +randRange(prng, 0.5, 4.2).toFixed(1), ownerHoursPerWeek: randInt(prng, 42, 56),
      menuTier: randInt(prng, 1, 3) as 1 | 2 | 3, avgTicketKrw: randInt(prng, 35, 68) * 100,
      makeTimeSec: randInt(prng, 45, 210), openDaysPerWeek: randInt(prng, 6, 7),
      cupsPerDayBase: randInt(prng, 110, 250), cogsRatio: +randRange(prng, 0.26, 0.58).toFixed(3), openingMonth: randInt(prng, 1, 12),
    };
    if (independentConstraintCheck(d, FIXED_CONSTRAINTS).ok) out.push(d); // rejected draws are simply not spent (same accepted budget N)
  }
  return out;
}

describe("AT-09 · Argon set vs random/grid baseline at the same N", () => {
  it("engine label and an honest uniform baseline over the same design space", () => {
    const run = runOrchestration({ runId: "verify-at09", mode: 10000, baseDesign: FIXED_BASE, constraints: FIXED_CONSTRAINTS, scenarios: [FIXED_SCENARIO], runAdversarial: false, persistToDisk: false });
    const argon = run.results.filter((r) => r.constraintsOk).map((r) => ({ ...r }));
    const argonND = markParetoNonDominated(argon), argonFam = countDistinctFailureFamilies(argon).size;
    const honest = honestRandomDesigns(argon.length, FIXED_CONSTRAINTS.seed);
    const hres = simulateBatch(honest, FIXED_SCENARIO, FIXED_CONSTRAINTS, { keepAllMonths: false, sampleMonthLimit: 0 });
    const honestND = markParetoNonDominated(hres), honestFam = countDistinctFailureFamilies(hres).size;
    const argonWins = argonFam >= honestFam && argonND >= honestND;
    const engineLabelConsistent = run.baseline?.label === (argonWins ? "ai-native" : "explorer");
    record({
      id: "AT-09", title: "같은 N 무작위·격자 기준선 대비 새 실패족·비지배 수", verdict: argonWins ? "DONE" : "FAIL", engineSha: SHA,
      evidence: [
        `engine baseline (N=${Math.min(1000, argon.length)}): argon families ${run.baseline?.argonNewFamilies} vs random ${run.baseline?.randomNewFamilies}; non-dominated ${run.baseline?.argonNonDominated} vs ${run.baseline?.randomNonDominated} -> ${run.baseline?.label}/${run.baseline?.koLabel}`,
        `verifier honest uniform baseline (N=${honest.length}, same space, seed ${FIXED_CONSTRAINTS.seed}): families ${honestFam} vs argon ${argonFam}; non-dominated ${honestND} vs argon ${argonND} -> argon >= baseline on both: ${argonWins}`,
        `engine label consistent with the honest comparison: ${engineLabelConsistent} (required wording when baseline wins: '탐색기')`,
      ],
      measured: { argonFam, argonND, honestFam, honestND, engine: run.baseline },
      findings: [
        "engine/baseline.ts generateRandomBaselineDesigns is a deliberately narrow grid around the base store (menuTier fixed 2, cogsRatio fixed 0.33, rent ±350k, area 36-56 m2). SPEC §5 asks for random+grid over the same patch space with the same budget. evaluateBaselineComparison also carries a forceBaselineWin flag.",
        "The 'Argon set' in the engine path is engine/baseline.ts generateStructuredStoreDesigns (hand-written archetypes), not model output; in offline/replay mode no Gemini call is made.",
      ],
    });
    assert.ok(argonWins, `honest baseline wins: fam ${honestFam} vs ${argonFam}, nd ${honestND} vs ${argonND}`);
  });
});

describe("AT-10 · forbidden-path patches rejected, result hash unchanged", () => {
  const five: Patch[] = [
    { path: "/tests/fixtures/expected/fixed_input.json", op: "set", value: 1, by: "StoreDesigner" },   // tests/ expected values
    { path: "/checks/reserveRatioMin", op: "set", value: 0.01, by: "StoreDesigner" },                    // check criteria
    { path: "/results/0/cumPnL", op: "set", value: 999_999_999, by: "StoreDesigner" },                   // result numbers
    { path: "/labels/calibration", op: "set", value: "보정됨", by: "StoreDesigner" },                     // label rules
    { path: "/reserveRatioMin", op: "set", value: 0.0, by: "BankruptcyDesigner" },                        // reserve ratio
  ];
  it("all 5 rejected with a reason; engine results identical before/after", () => {
    const bundles: VariantPatchBundle[] = five.map((p, i) => ({ id: `forbid-${i + 1}`, parentId: FIXED_BASE.id, patches: [p] }));
    const rep = validateAndApplyPatchBundles(FIXED_BASE, bundles, FIXED_CONSTRAINTS);
    const rejected = rep.rejectedPatches.length, withReason = rep.rejectedPatches.filter((r) => r.reason && r.reason.length > 0).length;
    const before = runOrchestration({ runId: "verify-at10-a", mode: 10000, baseDesign: FIXED_BASE, constraints: FIXED_CONSTRAINTS, scenarios: [FIXED_SCENARIO], runAdversarial: false, persistToDisk: false });
    const after = runOrchestration({ runId: "verify-at10-b", mode: 10000, baseDesign: FIXED_BASE, constraints: FIXED_CONSTRAINTS, scenarios: [FIXED_SCENARIO], runAdversarial: false, persistToDisk: false, rejectedReasons: rep.rejectedPatches });
    const same = digest(before) === digest(after);
    const ok = rejected === 5 && withReason === 5 && rep.acceptedDesigns.length === 0 && same;
    record({
      id: "AT-10", title: "금지 경로 패치 5종 거부·사유 로그·결과 해시 동일", verdict: ok ? "DONE" : "FAIL", engineSha: SHA,
      evidence: [
        `rejected ${rejected}/5, with reason ${withReason}/5, accepted designs ${rep.acceptedDesigns.length}`,
        ...rep.rejectedPatches.map((r) => `  ${r.path} -> ${r.reason.split(":")[0]}`),
        `results digest before ${digest(before).slice(0, 16)} == after ${digest(after).slice(0, 16)}: ${same}`,
      ],
      measured: { rejected, withReason, same },
    });
    assert.equal(rejected, 5);
    assert.ok(same);
  });

  it("V-03: invalid patches are rejected and logged, never repaired silently (SPEC §7)", () => {
    const bad: VariantPatchBundle[] = [
      { id: "v03-nan", parentId: FIXED_BASE.id, patches: [{ path: "/seats", op: "set", value: "twenty", by: "StoreDesigner" }] },
      { id: "v03-unknown", parentId: FIXED_BASE.id, patches: [{ path: "/design/colourOfWalls", op: "set", value: 3, by: "StoreDesigner" }] },
    ];
    const rep = validateAndApplyPatchBundles(FIXED_BASE, bad, FIXED_CONSTRAINTS);
    const silently = rep.acceptedDesigns.length;
    record({
      id: "V-03", title: "[검증자 추가] 비정상 패치(비숫자 값·미지 키)가 조용히 통과하는가", verdict: silently === 0 ? "DONE" : "FAIL", engineSha: SHA,
      evidence: [`accepted without change: ${silently} of 2 (expected 0); rejected: ${rep.rejectedPatches.length}`],
      findings: silently ? ["loop/validator.ts applyStorePatch returns the design unchanged for a non-numeric value or an unknown key and the bundle is then ACCEPTED as a 'variant' identical to its parent. SPEC §7: invalid items are rejected and logged, never repaired silently."] : [],
    });
    assert.equal(silently, 0);
  });
});

describe("AT-11 · no keys, allowlist-only egress, no payment/mail/contract paths", () => {
  it("working tree + full git history + runs/ logs; outbound host literals; forbidden code paths", () => {
    const keyPatterns: [string, RegExp][] = [
      ["google-api-key", /AIza[0-9A-Za-z_-]{35}/],
      ["openai-style", /\bsk-[A-Za-z0-9]{20,}\b/],
      ["aws-access-key", /\bAKIA[0-9A-Z]{16}\b/],
      ["google-oauth", /\bya29\.[0-9A-Za-z_-]{20,}/],
      ["private-key-block", /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/],
      ["gcp-service-account", /"type"\s*:\s*"service_account"/],
      ["bearer-literal", /Authorization['"]?\s*[:=]\s*['"]Bearer [A-Za-z0-9._-]{20,}/],
    ];
    const skipDirs = new Set(["node_modules", ".git", "raw", "dist"]);
    const files: string[] = [];
    (function walk(d: string) {
      for (const e of readdirSync(d)) {
        if (skipDirs.has(e)) continue;
        const p = join(d, e);
        if (statSync(p).isDirectory()) walk(p); else if (!/\.(zip|png|jpg|csv)$/i.test(p)) files.push(p);
      }
    })(ROOT);
    const treeHits: string[] = [];
    for (const f of files) {
      const txt = readFileSync(f, "utf8");
      for (const [name, re] of keyPatterns) if (re.test(txt)) treeHits.push(`${name}: ${f.replace(ROOT + "/", "")}`);
    }
    let histHits: string[] = [];
    try {
      const log = execSync("git log -p --all --no-color -- . ':(exclude)data/seoul/raw'", { stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 28 }).toString();
      for (const [name, re] of keyPatterns) if (re.test(log)) histHits.push(name);
    } catch { histHits = ["git history unreadable"]; }

    // Outbound hosts in source
    const allow = ["generativelanguage.googleapis.com", "maps.googleapis.com", "places.googleapis.com", "data.seoul.go.kr", "openapi.seoul.go.kr", "apis.data.go.kr", "www.data.go.kr", "data.go.kr", "localhost", "127.0.0.1"];
    const srcFiles = files.filter((f) => /\.(ts|js|mjs|sh|json|html)$/.test(f) && !f.includes("/tests/") && !/\.test\.ts$/.test(f) && !f.includes("/docs/") && !f.endsWith("manifest.json") && !f.endsWith("package-lock.json"));
    const hosts = new Set<string>();
    for (const f of srcFiles) for (const m of readFileSync(f, "utf8").matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) hosts.add(m[1].toLowerCase());
    const offList = [...hosts].filter((h) => !allow.some((a) => h === a || h.endsWith("." + a)) && !/^(github\.com|code\.claude\.com|data\.seoul\.go\.kr|registry\.npmjs\.org|nodejs\.org|json-schema\.org)$/.test(h));
    // A code PATH = an import/require of such an SDK or a request to such a host; a denylist constant naming them is not a path.
    const forbiddenCode = /((from|require\()\s*['"][^'"]*(stripe|paypal|tosspayments|iamport|portone|@sendgrid|nodemailer|mailgun|docusign|hellosign|twilio)[^'"]*['"])|(fetch\(\s*[`'"]https?:\/\/[^`'"]*(stripe|paypal|toss\.im|sendgrid|mailgun|docusign|modusign|twilio))/i;
    const codeHits = srcFiles.filter((f) => forbiddenCode.test(readFileSync(f, "utf8"))).map((f) => f.replace(ROOT + "/", ""));
    const bundleExists = existsSync(resolve(ROOT, "web"));
    const repoClean = treeHits.length === 0 && histHits.length === 0 && offList.length === 0 && codeHits.length === 0;
    record({
      id: "AT-11", title: "키 0건·허용 목록 외 호출 0건·결제/메일/계약 경로 없음", verdict: repoClean ? (bundleExists && URL ? "DONE" : "BLOCKED") : "FAIL", engineSha: SHA,
      evidence: [
        `working tree (${files.length} files): key-pattern hits ${treeHits.length}${treeHits.length ? " -> " + treeHits.join("; ") : ""}`,
        `git history (all refs): key-pattern hits ${histHits.length}${histHits.length ? " -> " + histHits.join(", ") : ""}`,
        `outbound host literals in source: [${[...hosts].join(", ")}]; outside allowlist: [${offList.join(", ")}]`,
        `payment/mail/contract code paths: ${codeHits.length}${codeHits.length ? " -> " + codeHits.join(", ") : ""}`,
        bundleExists && URL ? "client bundle + egress: see G2 run" : "client bundle (web/ missing) and server egress log cannot be scanned yet -> BLOCKED for those two parts",
      ],
      measured: { treeHits, histHits, hosts: [...hosts], offList, codeHits },
      findings: [
        "engine/cli.ts secrets-scan matches only the AIzaSy… pattern and only the working tree; it does not read git history or logs (SPEC AT-11). The verifier scan above covers 7 patterns and all refs.",
      ],
    });
    assert.ok(repoClean, JSON.stringify({ treeHits, histHits, offList, codeHits }));
  });
});

describe("AT-12 · incognito end-to-end with first-seen real input", () => {
  it("source wording scan now; user path needs the deployed URL", async () => {
    const skip = new Set(["node_modules", ".git", "raw", "tests", "docs"]);
    const hits: string[] = [];
    (function walk(d: string) {
      for (const e of readdirSync(d)) {
        if (skip.has(e)) continue;
        const p = join(d, e);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|js|mjs|html|json)$/.test(p) && !/\.test\.ts$/.test(p)) {
          // Count only lines that would EMIT the phrase, not lines that check for or forbid it.
          const offending = readFileSync(p, "utf8").split("\n").filter((l) => /생존확률|생존 확률|survival probability/i.test(l) && !/includes\(|\.test\(|match\(|forbid|금지|never|not /i.test(l));
          if (offending.length) hits.push(`${p.replace(ROOT + "/", "")} (${offending.length} line)`);
        }
      }
    })(ROOT);
    let urlNote = "VERIFY_URL not set -> user path BLOCKED (Aside + verifier at G2)";
    let urlOk: boolean | null = null;
    if (URL) {
      try {
        const res = await fetch(URL, { redirect: "follow" });
        const html = await res.text();
        urlOk = res.ok && !/생존확률|survival probability/i.test(html);
        urlNote = `GET ${URL} -> ${res.status}, forbidden wording in HTML: ${/생존확률|survival probability/i.test(html)}`;
      } catch (e) { urlOk = false; urlNote = `GET ${URL} failed: ${String(e)}`; }
    }
    record({
      id: "AT-12", title: "시크릿 창·처음 보는 실제 입력·에러 0·출처 태그·금지 문구 0·내보내기", verdict: hits.length ? "FAIL" : urlOk === null ? "BLOCKED" : urlOk ? "BLOCKED" : "FAIL", engineSha: SHA,
      evidence: [`forbidden wording ('생존확률'/'survival probability') in product source outside tests/docs: ${hits.length}${hits.length ? " -> " + hits.join(", ") : ""}`, urlNote, "source tag on every number, console errors 0, export opens: judged by Aside on the deployed URL (not from here)"],
      measured: { hits, urlOk },
    });
    assert.equal(hits.length, 0);
  });
});

describe("AT-13 · adversarial rounds: logged, bounded, one of S/P/O per step, oracle unchanged", () => {
  it("rounds.json rows <= 3 with stop reason; S/P label must match what changed", () => {
    const runsDir = resolve(ROOT, "tests/report/tmp-runs");
    rmSync(runsDir, { recursive: true, force: true });
    mkdirSync(runsDir, { recursive: true });
    const run = runOrchestration({ runId: "verify-at13", mode: 10000, baseDesign: FIXED_BASE, constraints: FIXED_CONSTRAINTS, scenarios: [FIXED_SCENARIO], runAdversarial: true, persistToDisk: true, runsDir });
    const f = resolve(runsDir, "verify-at13", "rounds.json");
    const exists = existsSync(f);
    const j = exists ? JSON.parse(readFileSync(f, "utf8")) : { rounds: [], oracleUnchanged: false };
    const rows = j.rounds as { round: number; shocksAdded: number; deaths: number; newFailureFamilies: number; nonDominatedSurvivors: number; changed: string; stopReason?: string }[];
    const n = rows.length;
    const last = rows[n - 1];
    const intFam = rows.every((r) => Number.isInteger(r.newFailureFamilies));
    const labelOk = rows.every((r) => (r.shocksAdded > 0 ? r.changed === "S" : true)); // shocks changed => S (shared/forbidden-paths.json rule)
    const oracleOk = j.oracleUnchanged === true;
    const stopOk = !!last?.stopReason && ["roundCap", "timeCap", "noNewFamily", "allSurvivorsKilled", "error"].includes(last.stopReason);
    const ok = exists && n >= 1 && n <= 3 && stopOk && intFam && labelOk && oracleOk;
    record({
      id: "AT-13", title: "적대 3라운드 기록·정지 사유·S/P/O 한 번에 하나·판정기 해시 동일", verdict: ok ? "DONE" : "FAIL", engineSha: SHA,
      evidence: [
        `rounds.json exists: ${exists}; rows=${n}; last stopReason=${last?.stopReason}`,
        ...rows.map((r) => `  r${r.round}: shocks +${r.shocksAdded}, deaths ${r.deaths}, newFamilies ${r.newFailureFamilies}, nonDominatedSurvivors ${r.nonDominatedSurvivors}, changed=${r.changed}`),
        `newFailureFamilies all integers: ${intFam}; S/P label consistent with change (shocks -> S): ${labelOk}; oracle hashes unchanged: ${oracleOk}`,
      ],
      measured: { rows, oracleUnchanged: j.oracleUnchanged },
      findings: [
        ...(labelOk ? [] : ["engine/orchestrator.ts labels every round changed='P' while it changes shocks (scenario). shared/forbidden-paths.json rule: S = scenario/shocks, P = store design. The S/P log is inverted."]),
        "No Store Designer response step exists in the rounds (shocks only); shocks come from the hardcoded DEFAULT_ADVERSARIAL_SHOCK_ROUNDS unless loop/ passes model shocks. Stop reasons implemented: roundCap, allSurvivorsKilled. timeCap (90 s per round) and noNewFamily (SPEC §5) are not implemented.",
        "Rounds run on the first 250 valid designs (slice(0,250)), not on the round-1 survivor set (AT-13 input).",
        "In offline/replay mode the round shocks are a fixed script; the status bar must show 'replay' for such a run.",
      ],
    });
    assert.ok(exists && n >= 1 && n <= 3 && stopOk && oracleOk);
    assert.ok(labelOk, "S/P label inverted");
  });
});

describe("AT-14 · status bar payload", () => {
  it("engine-side fields; screen needs the deployed URL", () => {
    const a = runOrchestration({ runId: undefined, mode: 10000, baseDesign: FIXED_BASE, constraints: FIXED_CONSTRAINTS, scenarios: [FIXED_SCENARIO], runAdversarial: false, persistToDisk: false });
    const b = runOrchestration({ runId: undefined, mode: 10000, baseDesign: { ...FIXED_BASE, monthlyRent: { ...FIXED_BASE.monthlyRent, value: 3_400_000 } }, constraints: FIXED_CONSTRAINTS, scenarios: [FIXED_SCENARIO], inputFiles: ["onsite-v2.json"], runAdversarial: false, persistToDisk: false });
    const s = a.status;
    const sumIn = s.tokens.reduce((x, t) => x + t.inputTokens, 0), sumOut = s.tokens.reduce((x, t) => x + t.outputTokens, 0);
    const tokensSum = sumIn === s.tokenTotal.input && sumOut === s.tokenTotal.output;
    const filesExist = s.inputFiles.map((f) => [f, existsSync(resolve(ROOT, f))] as const);
    const engineShaOk = s.engineSha === SHA;
    const idsDiffer = a.runId !== b.runId && b.status.inputFiles.includes("onsite-v2.json");
    const fieldsOk = !!s.runId && /^[0-9a-f]{8}$/.test(s.inputHash ?? "") && engineShaOk && ["DONE", "FAIL", "BLOCKED"].includes(s.endState ?? "") && typeof s.replay === "boolean" && s.gateLog.length >= 5 && s.gateLog.every((g) => !!g.at);
    const defaultTokens = s.tokens.some((t) => t.model === "gemini-2.5-flash" && t.inputTokens === 1840);
    record({
      id: "AT-14", title: "상태바: 실행 ID·입력 파일·해시·엔진 SHA·토큰·게이트 로그·끝 상태·재생", verdict: fieldsOk && tokensSum && idsDiffer ? "BLOCKED" : "FAIL", engineSha: SHA,
      evidence: [
        `runId=${s.runId}, inputHash=${s.inputHash}, engineSha=${s.engineSha} (git ${SHA}: ${engineShaOk}), endState=${s.endState}, replay=${s.replay}, gates=${s.gateLog.map((g) => `${g.gate}:${g.passed}`).join(" ")}`,
        `tokens per call ${s.tokens.length}, total in/out ${s.tokenTotal.input}/${s.tokenTotal.output} == sum of rows: ${tokensSum}`,
        `input files: ${filesExist.map(([f, e]) => `${f} (${e ? "exists" : "MISSING"})`).join(", ")}`,
        `two runs with one input changed: ids differ and new file name shown: ${idsDiffer} (${a.runId} / ${b.runId})`,
        URL ? `screen check against ${URL} pending Aside` : "screen strings and 'tokens == API usage sum' cannot be judged without the deployed URL and the API usage log -> BLOCKED",
      ],
      measured: { status: s, idsDiffer },
      findings: [
        ...(defaultTokens ? ["engine/orchestrator.ts fills status.tokens with hardcoded placeholder rows (gemini-2.5-flash 1840/920, …) whenever loop/ does not pass real usage. A status bar fed from the engine path alone shows fabricated token numbers; 'tokens = API usage sum' then cannot hold. Model ids in the placeholder (gemini-2.5-*) are not the models named in SPEC §3."] : []),
        ...(filesExist.some(([, e]) => !e) ? ["Default inputFiles lists a file that does not exist in the repo (data/seoul/2026/seongsu_cafe_2021_2026.csv)."] : []),
      ],
    });
    record({
      id: "V-04", title: "[검증자 추가] 토큰 수가 실제 API usage에서 오는가", verdict: defaultTokens ? "FAIL" : "BLOCKED", engineSha: SHA,
      evidence: [`placeholder token rows present in engine-path status: ${defaultTokens}`],
    });
    assert.ok(fieldsOk && tokensSum && idsDiffer);
  });
});

describe("AT-16 · 10,000 = 500 x 20, saturation curve", () => {
  it("10,000 results, 0 rejected, label, 3 curve points from the engine log, time", () => {
    const t0 = performance.now();
    const run = runOrchestration({ runId: "verify-at16", mode: 10000, baseDesign: FIXED_BASE, constraints: FIXED_CONSTRAINTS, scenarios: [FIXED_SCENARIO], runAdversarial: false, persistToDisk: false });
    const ms = performance.now() - t0;
    const fams = new Set(run.designs.map((d) => d.familyId)).size;
    const perFam = new Map<string, number>();
    for (const d of run.designs) perFam.set(d.familyId ?? "?", (perFam.get(d.familyId ?? "?") ?? 0) + 1);
    const curve = run.saturationCurve ?? [];
    const monotone = curve.every((p, i) => i === 0 || (p.failureFamilies >= curve[i - 1].failureFamilies && p.nonDominated >= 0));
    const ok = run.results.length === 10000 && run.rejectedCount === 0 && fams === 500 && run.modeLabel === "500 AI design families x 20 variations" && curve.length === 3 && curve.map((p) => p.n).join() === "1000,3000,10000" && (run.computeMs ?? 9e9) <= 2000;
    record({
      id: "AT-16", title: "1만 = 500족 × 20, 포화 곡선 3점, ≤ 2.0초", verdict: ok ? "DONE" : "FAIL", engineSha: SHA,
      evidence: [
        `results=${run.results.length}, rejected=${run.rejectedCount}, label='${run.modeLabel}', computeMs=${run.computeMs}, full run ${ms.toFixed(0)} ms`,
        `distinct familyId=${fams} (criterion: 500); families with != 20 variants: ${[...perFam.values()].filter((v) => v !== 20).length}`,
        `curve: ${curve.map((p) => `N=${p.n}: families ${p.failureFamilies}, nonDominated ${p.nonDominated}`).join(" | ")}; failure-family count non-decreasing: ${monotone}`,
        `saturation reading: ${curve.length === 3 ? (curve[2].failureFamilies > curve[1].failureFamilies ? "still growing at 10,000" : `saturated at N = ${curve[1].failureFamilies === curve[0].failureFamilies ? 1000 : 3000}`) : "n/a"}`,
      ],
      measured: { curve, fams, computeMs: run.computeMs },
      findings: [
        ...(fams !== 500 ? [`familyId count is ${fams}, not 500: engine/baseline.ts reuses fam-001/fam-002 for the planted leaders and pairs consecutive designs into one family (see V-01).`] : []),
        "The curve is computed by slicing the first N of the single 10,000 run (engine/landscape.ts computeSaturationCurveFromResults), not by re-running the pipeline at N = 1,000 / 3,000. Acceptable as evidence only if the screen says so.",
      ],
    });
    assert.ok(ok);
  });
});
