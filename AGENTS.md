<!-- AGENTS.md draft from the shared doc (2026-10-16 12:05 KST). Frozen at 12:15; after that only the Lessons section grows. Default N = 10,000 = 500 Argon design families x 20 deterministic expansions; 1,000 only for the spike. -->
# AGENTS.md - A Thousand Stores (hackathon build, 2026-10-16)

Read this file fully before any edit. Product owner: Taehyeon. Verifier: Claude Code (owns tests/). Build agent: Gemini 4 Argon in Antigravity, three lanes (A1 engine, A2 data and model loop, A3 screen). Inside the loop Argon plays two roles, Store Designer (mutations) and Bankruptcy Designer (shocks); neither touches the oracle.

## Repository structure
- engine/   A1. Deterministic 36-month simulator, constraint checks, backtest, landscape / cliff / next measurement, random-search baseline, adversarial round orchestrator (cap 3 rounds, time cap, S/P/O step log). No network calls.
- loop/     A2. Gemini Argon roles as JSON patches only: Store Designer (design mutations) and Bankruptcy Designer (shocks). Patch validation, retry and timeout policy, token usage accounting per call.
- data/     A2. Public inputs: Seoul Open Data Plaza 상권분석 (2021-2024 open/close rates, estimated sales), data.go.kr 상가정보 and 건축물대장, on-site inputs entered by the user. Maps grounding cards are P1 only, off the core path; public data is the source of truth. No personal data, no company data, no unlabeled synthetic values.
- web/      A3. UI: input > landscape > cliff > next measurement > adversarial rounds table > decision > Docs and Sheets export. Always-visible status bar: run ID, input file names, token usage (per call, total), gate log.
- shared/   Types, store/scenario schema, forbidden-path list. FROZEN at 12:15 (see "Changing shared types").
- tests/    Acceptance tests AT-01..AT-14, fixtures, backtest reference values. Owned by the verifier. Read-only for the build agent.
- infra/    Cloud Run service config and deploy script. Owned by Taehyeon.
- docs/     Demo script, README (English), decision log.

## Commands
- npm install              install dependencies
- npm run dev              local web + engine
- npm test                 unit tests (engine, loop, web); must pass before every commit
- npm run test:accept      acceptance tests AT-01..AT-14 (reads tests/accept)
- npm run backtest         backtest gate: prints open/close-rate error in pp and the calibrated / uncalibrated label
- npm run bench            10,000 variants x 36 months timing, median of 5 runs, must be <= 2.0 s
- npm run baseline         random / grid search with the same budget; prints new-failure-family and non-dominated counts vs Argon
- npm run adversarial      three adversarial rounds on the current survivors; prints shocks, deaths, new failure families per round and the stop reason
- npm run secrets:scan     fails if any key-like string is in the client bundle, git history or logs
- npm run deploy           Cloud Run deploy (Taehyeon only)

## Rules for the build agent
1. One lane edits only its own folder. Cross-lane needs go through shared/ types and a note under Lessons.
2. Never edit tests/, fixtures, expected values, or engine result numbers. If a test seems wrong, write it under Lessons and stop.
3. Variants are JSON patches validated against shared/forbidden-paths. Patches touching checks, expectations or results are rejected and logged. Both Argon roles (Store Designer, Bankruptcy Designer) are bound by this, and only one of S/P/O changes per step.
4. Keys come only from the Cloud Run environment or Secret Manager. Never in code, client bundle, git or logs.
5. Outbound allowlist: Gemini API, Grounding with Google Maps, Seoul Open Data Plaza, data.go.kr (상가정보, 건축물대장). Nothing else. No external actions (payments, contracts, emails, bookings).
6. No autonomous agent frameworks in the GCP project. No company data or code. No product code before 11:20 KST.
7. Every displayed number carries a source tag (computed / assumed / user-confirmed). Never phrase scenario frequencies as real-world probabilities.
8. Commit small and often: lane prefix in the message (A1:, A2:, A3:), tests green, no secrets.
9. Adversarial loop: at most 3 rounds and a wall-clock cap per round. Each round appends shocks, deaths, new failure families, non-dominated survivors and a stop reason to runs/<run-id>/rounds.json. No open-ended agent-to-agent calls; engine/ orchestrates every step.
10. Observability: every screen shows run ID, input file names, token usage (per model call and total) and the gate log. runs/<run-id>/ is append-only.
11. End states and replay: every run ends as DONE, FAIL or BLOCKED with a reason under runs/<run-id>/; nothing ends silently or stays "running" after the time cap. Any replayed or cached result carries a "replay" label on screen and in the logs and is never shown as live.

## Changing shared types
shared/ is frozen at 12:15. To change it: post the diff and the reason in chat, wait for Taehyeon's explicit "approved", update shared/, run npm test and npm run test:accept, then record the change under Lessons with time and reason. No approval, no change.

## Gates (KST)
G1 13:10 engine end to end on the fixed input, AT-03..AT-07 green. G2 14:00 deployed URL with a real input, AT-01, AT-05, AT-12, AT-14 green. P1 order after G2: adversarial rounds (AT-13) > saturation curve (N = 1,000 / 3,000 / 10,000, AT-16) > peak-hour queue > Sheets export > Maps card. 14:25 feature freeze (P0 defects only). 15:05 submit.

## Lessons (append-only; newest at the bottom)
Format: [HH:MM] [lane] what broke or surprised us > what we changed > which test now catches it.
- [12:15] [all] (first entry written at kickoff)
- [12:46] [integration] The docs-only commit 34d2abc also removed code, shared schema and public datasets. Restored their exact 88b3616 contents on a separate integration branch while preserving the newer planning documents. Keep partial lane uploads from replacing the complete repository tree.
- [12:46] [verification] Local presets were labelled AI-generated, unused model calls had synthetic token counts, and an aggregate heuristic was labelled cashflow-calibrated. Added numeric rejection and evidence-shape regression checks; retained uncalibrated/explorer/zero-call labels. Corrected implementation unit assertions for these labels; tests/ acceptance criteria, fixtures, financial expected amounts and shared/ remain unchanged. Business acceptance is still incomplete.
