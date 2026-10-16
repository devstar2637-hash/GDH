# 10,000-candidate update — 2026-10-16

The four user-supplied source files match the corresponding planning documents already on upstream main byte for byte. Their implementation targets are adopted; embedded kickoff pauses, old role assignments, notifications and publication instructions are not treated as fresh authorization. The user's direct-code authorization and PR-only decision govern this update. Frozen `shared/`, verifier-owned `tests/`, fixtures and raw public datasets are unchanged.

| Uploaded source | Repository source | SHA-256 |
|---|---|---|
| 1만AGENTS.md | AGENTS.md, before appended Lessons | `1be6d22f557e54319d7717cff66517bab5ff5b2306b0a0f2340769a8c5b17001` |
| 1만README.md | README.md, before implementation status | `cec3161650367da88708629e737f99902bc10d310069ada5e1862bc1c432dba2` |
| 1만KICKOFF_PROMPT.md | docs/KICKOFF_PROMPT.md | `c850626c1038bfa768156e3117ac47131f5c8fa9263772f5ee670d4d21d9d208` |
| 1만SPEC.md | docs/SPEC.md | `b01296c44e84ba156df6b78139eb727d1920de25011e3f565f84b45c30e42bed` |

## Implemented behavior

- Default web request: 500 local preset seed families × 20 deterministic variations = 10,000 candidates. The 1,000-candidate option is explicitly a spike. Local generation never receives the AI-family label.
- Model adapter: five requests of 100 structural patches, concurrency four; strict 500-family completion, unique identifiers and distinct complete parameter sets before expansion. The source's default 5×100 design-family section governs this path; the older 10×100/900-valid passage is not used to lower the gate. Live provider/model availability is still unverified.
- Every expanded candidate has its own ID, including caller-supplied duplicate family labels. Duplicate original design IDs are rejected before map insertion. Zero demand and zero paid staff remain zero under relative variations.
- All candidate aggregates remain available. At most 50 actual sampled monthly ledgers plus the actual leader's ledger are retained; a short population does not manufacture samples. The user-base case stays exact in preview mode.
- Status and exports distinguish calculated candidates, unique IDs, unique assumption sets, generation origin, actual usage, input snapshot/hash, source SHA and terminal state. Partial model families are preserved with a failed run, without preset substitution.
- A bounded sensitivity search proposes intervals, then checks their endpoints and a control on the full valid population. This proves only the returned interval's endpoint reversal, not a global minimum or an exact analytic boundary. No verified reversal means null cliff and measurement.
- Large HTTP JSON responses use gzip when accepted. Compressed wire size and expanded JSON size are different measurements; this does not establish the approximate 1 MB payload target.

## Evidence and remaining gates

Local build, unit/HTTP tests and browser receipts are recorded for the pushed source revision. Provider I/O in automated tests is mocked. Local timing is not Cloud timing. Candidate identity and shared-formula consistency are verified; this is not an independent 10,000-case financial oracle.

Unmet or unverified: live 500-family Gemini execution and actual token cost, Cloud deployment, cashflow calibration and hidden holdout, AI-versus-random advantage, 1 MB expanded payload, two-second whole-path performance, durable cloud persistence, full planned landscape/distribution presentation and live three-round adversarial model execution. The uncalibrated path remains available and distribution charts stay hidden. Business acceptance gates are preserved rather than relaxed.

PR #2 is the reviewable deliverable. Main remains unmerged by user decision. No messages, submissions, public publishing or new schedules are triggered by these attachments.

## Connected six-screen client

Upstream `f9e4b92` is integrated into the PR history. The six-screen client is now connected at `/rehearsal/` to the same validated `/run` API as the compact workbench. The root page links to it. The client is type-checked and bundled, all inline CSS has moved to its dedicated stylesheet, and server-only code and credentials do not enter the bundle.

The old fixed AI/calibration/holdout claims were removed. Initial state is unrun; actual model requests require the separate AI button. Financial distributions remain hidden, and the leader's individual cashflow is labelled as an assumption-based calculation. Unrun rounds, peak-queue estimates and endpoint-replay controls are not presented as completed features. Stored public summaries are separate context with the raw-reconciliation limitation visible.

Fresh human decisions are required before export. Input edits, in-flight changes and failed or blocked responses cannot reuse a prior result or choice. CSV/JSON preserve the actual run evidence; Markdown is a short readable report, with the full JSON exported separately. The inactive original prototype-contract file remains in `web/client/a3-integration-contract.test.ts`; it is not a passing business gate.

Build and 126 active unit/HTTP checks pass. Actual Chrome passed 20 checks on code revision `62e5cd78b98c953d8d0339b876bb12ad96a37c50`, including 10,000 unique candidate IDs, the actual leader canvas/ledger, zero-demand boundary arithmetic, stale/in-flight guards, blocked AI handling, original downloaded CSV/JSON/Markdown bytes and 390px layout. The Markdown fixture is 8,107 bytes. Live model calls: 0. These are local checks, not Cloud deployment evidence.

The participant approved deployment to the accessible event project `h2gdm-hack26icn-2637`; the earlier configured project was inaccessible to the event account. Cloud deployment and reviewer access must be separately verified before filling the submission URL.
