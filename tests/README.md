# tests/ — verifier-owned (Claude Code). Read-only for the build agent.

Purpose: judge AT-01..AT-16 from a fixed input and expected values only. The build agent never edits this folder; if a test looks wrong, write it under AGENTS.md > Lessons and stop (Taehyeon decides).

## Run

```
bash tests/run.sh "G1 13:10"                         # all acceptance tests -> tests/report/latest.md
VERIFY_URL=https://<cloud-run-url> bash tests/run.sh "G2 14:00"   # also hits the deployed URL (AT-11/12/14)
npm run test:accept                                  # same tests via engine/cli.ts accept (node --test), then A1's summary
```

Each test records exactly one verdict per ID: **DONE** (criterion met on the fixed input), **FAIL** (criterion not met), **BLOCKED** (cannot be judged yet: missing URL, folder or log). Evidence and measured numbers are written next to the verdict. Failures are recorded as failures, never hidden.

## Fixed input

Seongsu-dong cafe, budget 120,000,000 KRW, 36 months, seed 20261016, N = 10,000 (500 families x 20), scenario = one 8 % off-season dip in months 1-2. Pinned in `tests/lib/fixed_input.ts`; its sha256 is in `tests/fixtures/expected/fixed_input.json`. If shared/ changes, the guard test fails first.

## Layout

| Path | What |
|---|---|
| `accept/g1_engine.test.ts` | AT-03, 04, 05, 06, 07, 08 (+ V-01 id uniqueness, V-05 default end state) |
| `accept/backtest.test.ts` | AT-01, 02, 15 (+ V-02 calibration integrity) |
| `accept/loop_security.test.ts` | AT-09, 10, 11, 12, 13, 14, 16 (+ V-03 silent patch repair, V-04 token provenance) |
| `lib/ledger.ts` | Independent 36-month ledger and constraint check. Imports nothing from engine/. |
| `lib/fixed_input.ts` | The fixed input, canonical sha256, git SHA helper |
| `lib/judge.ts` | Verdict recorder (`tests/report/verdicts.jsonl`) |
| `fixtures/backtest_reference*.{json,csv}` | 22-quarter Seongsu cafe reference built from the public ZIPs (`scripts/build_backtest_reference.py`) |
| `holdout/` | Hidden holdout 2025Q1-2026Q2 + sha256. Never read by calibration code (checked by perturbation in AT-15) |
| `report/build.ts` | Builds the Markdown AT table from verdicts; writes `report/latest.md` |
| `ACCEPTANCE_TESTS.md` | The AT table as agreed (Korean) |

V-xx rows are verifier integrity checks that are not in the AT table; they do not change an AT verdict by themselves but are reported with it.

## Rules the verifier follows

- Judge only from fixed inputs and expected values. Never read the generator's own description first.
- Never change an expected value to make a test pass. Thresholds (±5 pp, 10 %, 2.0 s) come from the final report and change only by Taehyeon's decision.
- Never edit engine/, loop/, web/, shared/ or main.
