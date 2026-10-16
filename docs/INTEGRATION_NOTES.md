# Verified reference MVP: integration handoff

Observed upstream: `a869ef85da9bccfc73f9ce3c0eb853c9eab26587` on 2026-10-16. Its `AGENTS.md`, `docs/SPEC.md`, `shared/types.ts` and root `package.json` introduce a TypeScript A1/A2/A3 lane structure and frozen shared contract. This branch began from the earlier public-data commit `6b74c8c` and is a standalone executable reference. It must be reviewed before integration: its root package and Docker configuration differ from upstream.

## What has execution evidence

- Antigravity authored the application code. Independent local verification used separate fixed arithmetic inputs, actual public CSV values, HTTP requests and an isolated Chrome profile.
- `npm test`: 6/6 passed, including the corrected official REST-shaped Gemini mock.
- Independent verifier: 10/10 passed for exact cash boundaries, reserve accounting, KRW rounding, zero and missing values, zero-spread identity, seed reproducibility, invalid types, mocked provider completion/quotas and HTTP provenance.
- Actual Chrome: baseline amounts, zero-volume months 8/9, blank-input rejection, missing source sales, 390px width without overflow, in-flight edits, reversed response order, per-run human decision reset and exported JSON snapshot passed. No browser exceptions were observed in that test.
- Gemini live calls, container build, Cloud Run, calibration, benchmark, random/grid comparison and main acceptance gates are unverified. No main AT pass count is asserted.

## Differences that need an adapter or further implementation

| Area | This reference | Upstream contract / remaining work |
|---|---|---|
| Layout / API | Dependency-free JS in `src/`, static `public/`, `/api/simulate` | TS lanes `engine/`, `loop/`, `web/`; `/run`, `/runs/:id`, `/patches`; preserve existing root config |
| Cashflow | Constant explicit monthly transaction/cost assumptions; deposit remains locked through month 36 | Full store/scenario engine with labour, rent, capacity and shocks; upstream requires deposit returned in final month. Reconcile this policy explicitly before comparing expected month-36 values |
| Constraints | Reports a reserve failure and cash shortfall separately | Invalid designs must be rejected separately from operating deaths; add full area/seat/budget and patch constraints |
| Scenarios / AI | 1,000 seeded numeric assumption variations; optional one-call bounded proposal endpoint | Argon structural design patches, forbidden-path validator, model usage per call and baseline comparison remain to implement |
| Cliff / measurement | Cash-positive daily transaction boundary; two suggested measurement checks | One leading-design rank flip and its one linked next measurement; do not relabel this arithmetic boundary as an AT-07 cliff |
| Public data | 12 verified 2026Q2 cafe-area context records with source rows/hashes; 3 missing-sales records stay null | Full 22-quarter tagged loaders and calibration/holdout gates. Aggregate rates do not establish individual-store survival or cashflow accuracy |
| Run evidence | Fresh request/input snapshot, decision and downloadable JSON; unlinked Gemini usage omitted | Persistent append-only run records, input SHA-256, engine git SHA, terminal state/replay/gate log and canonical `RunResult` remain to connect |
| Export / deploy | JSON download, Node 22 Docker recipe, upload exclusions | Docs/Sheets or CSV path and actual authorized Cloud deployment remain unverified |

## Safe reuse

Lane owners can reuse the arithmetic edge cases, conserved KRW rounding policy, missing-sales handling, request sequence/snapshot guard, explicit per-run decisions, official REST parser and credential exclusions. Port these to the existing interfaces and rerun the verifier-owned acceptance suite. Keep the current `shared/`, `tests/`, oracle values and production root scripts unchanged while reviewing this reference.

Model-generated assumptions are checked for bounds and arithmetic only. That check is not evidence that their business assumptions are correct. The UI labels the model as unavailable when no key is configured; seeded simulations are never presented as AI-generated designs or real-world survival probabilities.
