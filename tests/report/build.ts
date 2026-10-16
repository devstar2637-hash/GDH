// tests/report/build.ts — aggregates tests/report/verdicts.jsonl into the AT table (DONE/FAIL/BLOCKED) + findings.
// Usage: npx tsx tests/report/build.ts [label]   -> prints Markdown and writes tests/report/latest.md

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { VerdictRecord } from "../lib/judge.js";

const label = process.argv[2] ?? "";
const p = resolve(process.cwd(), "tests/report/verdicts.jsonl");
if (!existsSync(p)) { console.error("no verdicts.jsonl — run tests/run.sh first"); process.exit(2); }
const all = readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as VerdictRecord);
const latest = new Map<string, VerdictRecord>();
for (const v of all) latest.set(v.id, v); // last write wins
const order = (id: string) => (id.startsWith("AT-") ? Number(id.slice(3)) : 100 + Number(id.slice(2)));
const rows = [...latest.values()].sort((a, b) => order(a.id) - order(b.id));
let sha = "unknown";
try { sha = execSync("git rev-parse --short=8 HEAD").toString().trim(); } catch { /* ignore */ }
const kst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 16) + " KST";

const count = (v: string) => rows.filter((r) => r.id.startsWith("AT-") && r.verdict === v).length;
const lines: string[] = [];
lines.push(`### 검증자 결과표 ${label ? "· " + label : ""} (${kst}, engine ${sha}, 고정 입력: 성수동 카페 · 1억 2천만 · 36개월 · seed 20261016 · 1만 개)`);
lines.push("");
lines.push(`DONE ${count("DONE")} · FAIL ${count("FAIL")} · BLOCKED ${count("BLOCKED")} (AT 기준). 판정은 tests/accept/*.test.ts 코드가 했고 사람은 수치를 고치지 않았다.`);
lines.push("");
lines.push("| ID | 항목 | 판정 | 증거(측정값) |");
lines.push("|---|---|---|---|");
for (const r of rows) {
  const ev = r.evidence.map((e) => e.replace(/\|/g, "／")).join("<br>");
  lines.push(`| ${r.id} | ${r.title} | ${r.verdict} | ${ev} |`);
}
lines.push("");
const findings = rows.flatMap((r) => (r.findings ?? []).map((f) => `- [${r.id}] ${f}`));
if (findings.length) {
  lines.push("무결성 소견(판정과 별개로 기록):");
  lines.push(...findings);
  lines.push("");
}
lines.push("4줄 요약:");
lines.push(`- 바뀐 것: tests/ (검증자 하네스 ${rows.length}개 판정, 고정 입력 해시 ${existsSync("tests/fixtures/expected/fixed_input.json") ? JSON.parse(readFileSync("tests/fixtures/expected/fixed_input.json", "utf8")).sha256.slice(0, 12) : "?"}…, 홀드아웃 해시 파일). 엔진·루프·web·main은 건드리지 않음.`);
lines.push(`- 실제로 확인한 것: DONE ${count("DONE")}건 — ${rows.filter((r) => r.verdict === "DONE").map((r) => r.id).join(", ")}`);
lines.push(`- 실패: ${rows.filter((r) => r.verdict === "FAIL").map((r) => r.id).join(", ") || "없음"}`);
lines.push(`- 모르는 것(BLOCKED): ${rows.filter((r) => r.verdict === "BLOCKED").map((r) => r.id).join(", ") || "없음"} — 배포 URL·web/·API usage 로그가 있어야 판정 가능`);
const md = lines.join("\n");
console.log(md);
writeFileSync(resolve(process.cwd(), "tests/report/latest.md"), md + "\n", "utf8");
