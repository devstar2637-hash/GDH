# A Thousand Stores

Rehearse the cashflow before signing the lease.

A scenario workbench for prospective cafe founders, using a deterministic 36-month engine and a default set of **10,000 candidates: 500 preset seed families × 20 seeded variations**. Local presets are labelled separately from model proposals. Financial calibration remains unverified.

## Run the reviewed version

The reviewed implementation is on **`codex/fast-track`**, in [PR #2](https://github.com/devstar2637-hash/GDH/pull/2). Main is not merged. Clone the intended branch explicitly:

```bash
git clone --branch codex/fast-track https://github.com/devstar2637-hash/GDH.git
cd GDH
npm ci --ignore-scripts
npm run build
npm start
```

Open `http://127.0.0.1:8080/rehearsal/` for the six-screen rehearsal, or `http://127.0.0.1:8080/` for the compact workbench. These are local addresses on the computer running the server, not public demo URLs. A no-key preview is available. The approved Google Cloud project is `h2gdm-hack26icn-2637`. Its public URL must be verified and entered in [the submission field sheet](docs/SUBMISSION_FORM_FIELDS.md) before submission.

## What the prototype does

1. Accepts explicit assumptions about the budget, deposit, rent, staffing, demand and operating structure.
2. Simulates candidates under deterministic 36-month arithmetic, with invalid designs rejected separately from operating failures.
3. Keeps unique candidate IDs, reports the actual count of distinct economic assumptions, preserves explicit zero values and retains the actual leader's monthly ledger.
4. Proposes bounded sensitivity intervals and confirms both endpoints against the full valid population before showing a ranking reversal. This does not prove a global minimum or an exact analytic boundary.
5. Shows source, input hash, source revision, observed model usage, terminal state and verification limits. Uncalibrated financial distributions stay hidden; the individual leader ledger is an illustrative calculation.
6. Requires a fresh human decision before CSV, JSON or Markdown export. Editing inputs or changing them during execution invalidates the old decision and exports.

Public Seoul commercial-area summaries are shown as separate context. They do not establish the demand, sales or cashflow of an individual cafe, and raw CSV reconciliation remains unverified. The default inputs are assumptions; no on-site measurement is claimed.

## Optional Gemini proposal path

Configure `GEMINI_API_KEY` only in the server environment or Secret Manager and select the account's available `GEMINI_MODEL`. The requested default ID is `gemini-4-argon`; its live availability is unverified. Pressing the explicit AI button requests five batches of 100 structural families, at most four requests concurrently, with 30-second per-call and 75-second total limits. Each server process permits one five-call batch. Only 500 valid distinct families plus completed usage records permit the AI-family label; partial results fail and preserve their evidence without preset replacement. No automatic retry or model substitution is used.

**Live model calls during this preparation: 0.** Provider I/O in automated tests is mocked. The planning reference `gemini-3.8-flash` has not been executed in this demo.

## Verification and limits

```bash
npm test
npm run test:accept
npm run backtest
npm run bench
npm run baseline
npm run adversarial
npm run secrets:scan
```

Build and 126 active unit/HTTP checks passed after connecting the six-screen client. Actual Chrome verification passed 20 checks on code revision `62e5cd78b98c953d8d0339b876bb12ad96a37c50`, covering the default 10,000-candidate run, original leader-ledger/canvas consistency, input and in-flight freshness, no-key failure handling, actual CSV/JSON/Markdown downloads and a 390px viewport. No live model call was made. The earlier compact-workbench receipt is separate evidence for its earlier revision.

Business acceptance remains incomplete: financial calibration/hidden holdout, full independent ledger coverage, live AI-family execution and advantage over random search are unverified. The sampled runtime consistency check shares production arithmetic; seven fixed external arithmetic cases do not establish a full independent oracle. The old prototype API-contract file remains inactive; protected verifier tests, fixtures and shared types are unchanged.

Three earlier local preview HTTP measurements were 594–772 ms, including decoded JSON parsing, with about 854 KB gzip and 13 MB decoded JSON. Those observations exclude DOM rendering and provider calls and are not Cloud benchmarks. `npm run bench` measures only the local simulation batch.

Web records are append-only on the current filesystem; Cloud Run storage is temporary. Export evidence to retain it across replacement. Taxes, borrowing and depreciation are outside the model. This prototype supports scenario exploration and human review; it is not financial advice.

## Google Cloud deployment

Use the participant-approved project explicitly:

```bash
GCP_PROJECT=<approved-project-id> DEPLOY_WITHOUT_GEMINI=1 npm run deploy
```

The source-deployment script uses the root Dockerfile and records the committed source SHA. It requires active Cloud CLI login and project permissions. To enable actual model requests, first configure the `gemini-api-key` Secret Manager secret without putting its value in code, logs or chat, then deploy without `DEPLOY_WITHOUT_GEMINI=1`. A deployed no-model preview does not satisfy a live-AI claim.

## Submission materials

- [English project description](docs/SUBMISSION_DESCRIPTION_EN.md)
- [Copy-ready field sheet](docs/SUBMISSION_FORM_FIELDS.md)
- [Submission checklist](docs/SUBMISSION_CHECKLIST.md)
- [English demo scripts](docs/DEMO_SCRIPT_EN.md)
- [Judges' questions and answers](docs/JUDGES_QA.md)
- [Specification](docs/SPEC.md) and [implementation scope](docs/TEN_K_UPDATE.md)

Organizer instructions supplied by the participant require **English materials, Google Cloud deployment and submission by 15:20 KST on 2026-10-16** through the registered account at [Cerebral Valley](https://cerebralvalley.ai/e/google-deepmind-ai-hackathon). The three-minute video target is an internal preparation choice; authenticated form fields are not yet confirmed. No final submission has been sent.

## Data and code licensing

Seoul Open Data Plaza inputs retain their attribution and notices in `LICENSE_NOTICE.txt` and `data/seoul/README.md`, including applicable Korea Open Government License Type 1 attribution. Follow each dataset's own notice. The application code has no license selected; public visibility is not a grant of an invented license.

## Next steps

Complete financial calibration and independent holdout evaluation, validate the live model path and its measured costs, compare it with a budget-matched random baseline, and add durable deployment storage. These are planned work, not current results.
