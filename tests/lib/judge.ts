// tests/lib/judge.ts — verifier-owned. Records one verdict per acceptance test.
// Verdicts: DONE (passed on fixed input), FAIL (criterion not met), BLOCKED (cannot be judged yet: missing URL, folder, key).
// Every verdict carries evidence strings and measured numbers so the report is reproducible.

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

export type Verdict = "DONE" | "FAIL" | "BLOCKED";

export interface VerdictRecord {
  id: string;            // "AT-03"
  title: string;
  verdict: Verdict;
  evidence: string[];    // human-readable facts
  measured?: Record<string, unknown>;
  findings?: string[];   // integrity notes that do not change the verdict by themselves
  at: string;            // ISO time
  engineSha?: string;
}

const REPORT_DIR = resolve(process.cwd(), "tests/report");
const VERDICTS = resolve(REPORT_DIR, "verdicts.jsonl");

export function record(v: Omit<VerdictRecord, "at">): VerdictRecord {
  if (!existsSync(REPORT_DIR)) mkdirSync(REPORT_DIR, { recursive: true });
  const full: VerdictRecord = { ...v, at: new Date().toISOString() };
  appendFileSync(VERDICTS, JSON.stringify(full) + "\n", "utf8");
  // Also echo a one-line summary so plain `node --test` output shows the verdict.
  console.log(`[${full.verdict}] ${full.id} ${full.title}`);
  for (const e of full.evidence) console.log(`    - ${e}`);
  for (const f of full.findings ?? []) console.log(`    ! ${f}`);
  return full;
}

export function verdictsPath(): string {
  return VERDICTS;
}
