#!/usr/bin/env bash
# tests/run.sh — verifier entry point. Runs every acceptance test against the fixed input and prints the AT table.
#   bash tests/run.sh [label]              e.g. bash tests/run.sh "G1 13:10"
#   VERIFY_URL=https://... bash tests/run.sh "G2 14:00"   (enables the deployed-URL checks)
# Exit code is 0 even when tests fail: the table is the deliverable; failures are recorded as FAIL, never hidden.
set -u
cd "$(dirname "$0")/.."
mkdir -p tests/report
rm -f tests/report/verdicts.jsonl
node --import tsx --test tests/accept/*.test.ts > tests/report/last_run.tap 2>&1 || true
grep -E '^# (tests|pass|fail) ' tests/report/last_run.tap || true
npx tsx tests/report/build.ts "${1:-}"
