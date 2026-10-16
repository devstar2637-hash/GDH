# A Thousand Stores: hackathon MVP contract

Target: help a prospective cafe owner decide what to measure before signing a lease. Build during the hackathon in Antigravity. This is scenario analysis, not individual survival prediction or financial advice.

## P0

- One complete path: explicit input assumptions -> deterministic 36-month cashflow -> 1,000 seeded assumption scenarios -> a transaction-volume break-even boundary -> next measurement -> human decision (hold / measure / proceed).
- Use attributed public Seoul data already in this repository as observed context. Never replace missing sales with zero or infer an individual store's transactions from aggregate sales. Distinguish observed data, user assumptions, AI suggestions, and unverified results.
- Initial available cash = budget - locked deposit - opening expenditure. Deposit is not a recurring expense. Monthly sales = average ticket x transactions/day x trading days/month. Monthly operating cash change = sales x (1 - variable-cost ratio) - fixed cash outflows. Avoid calling it net profit: taxes, debt, depreciation and working capital are not modeled.
- Reserve gate: initial available cash >= 10% of original budget. Report zero-cash boundary and first negative-cash month separately. After negative cash, projection is arithmetic only; continued operation or financing is not established.
- Batch counts describe assumed scenarios, not probability estimates. A deterministic preset must be labeled as such, and must not be presented as a Gemini run. LLM proposes bounded assumptions; deterministic code verifies and computes. One bounded Gemini call per requested proposal, with request timeout and explicit error/unconfigured states.
- UI: a useful polished responsive dashboard, input form, attributed context, 36-month curve, scenario distribution, boundary/next measurement, human decision and downloadable evidence with run ID, exact inputs, seed, model/usage when actually available, source files and verifier results. No fake latency, success rate, token counts or calibration claim.
- Google AI: server-side Gemini integration using current official API; configurable model, API key from server environment only. Never put credentials in client files, logs, git, API responses or chat. An unavailable model/key must remain unavailable, not silently fake AI output.
- Google Cloud: Cloud Run compatible server/Dockerfile and accurate deploy instructions. Do not deploy, enable billing, create accounts, read credentials, or change cloud project during initial implementation. Active cloud login is currently not available to this execution environment.
- Exclude voice, 3D, external messaging, speculative calibration, automated lease decisions and uncontrolled parallel LLM calls.

## Independent synthetic acceptance cases

These are fixed arithmetic or missingness checks, not real-world performance data.

1. B=120,000,000; D=30,000,000; K=42,000,000; ticket=5,000; transactions/day=100; days/month=24; variable ratio=.35; monthly fixed=6,000,000. C0=48,000,000; monthly sales=12,000,000; operating cash change=+1,800,000; month36 cash=112,800,000. First integer daily volume with positive cash change is 77.
2. Same inputs, explicit transactions/day=0: sales=0; change=-6,000,000; month8 cash=0; first negative month=9. Distinguish this explicit zero from missing input.
3. B=120,000,000; D=108,000,000; K=0: reserve 12,000,000 passes exact 10%. D=109,000,000: reserve 11,000,000 fails. Deposit is never monthly expense.
4. Store row exists but no corresponding sales row: observed sales stays missing and cannot produce a data-derived cashflow or rank. An explicit separate user transaction assumption can enable a user-assumption simulation. Missing or blank transaction input must not coerce to zero.

## Verification budget and completion

Initial budget: one Antigravity implementation session (up to 15 minutes), two focused repair passes if an actual defect is found, one code/security review, one independent arithmetic suite, one HTTP smoke suite and browser check if a browser is available. Model calls: at most one deliberate live Gemini smoke call after credentials are configured; mocked tests must be labeled. Costs remain unmeasured unless reported by the provider. Stop repeating a failed path without new evidence.

Completion requires actual commands and outputs, not self-assessed quality. Local tests, GitHub readback, live Gemini execution and deployed URL are separate statuses. Do not claim unexecuted stages complete.
