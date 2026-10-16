# A Thousand Stores · Google DeepMind Hackathon (2026-10-16)

> **Verified reference MVP (2026-10-16).** The 6 repository tests and 10 independent local checks passed. Actual Chrome checks passed at desktop 1440px and mobile 390px, including stale inputs, reversed response order, fresh human decisions and JSON evidence export. Gemini checks used mocks; live provider calls, container builds and Cloud Run deployment remain unverified.
>
> This branch contains a standalone reference implementation. Integration with the TypeScript lane structure and frozen shared contract added to `main` at `a869ef8` remains pending. See [integration notes](docs/INTEGRATION_NOTES.md) for the exact differences; these local checks do not certify the main project's AT-01–AT-16 gates.

## Overview

**A Thousand Stores** helps a prospective Seoul cafe owner decide **what to measure in the field before signing a commercial lease**. It is a scenario analysis and pre-lease measurement workbench, not an individual store survival predictor or financial advisor.

### Core Path (P0)
1. **Attributed Public Seoul Context (`data/seoul/context_2026_sample.json`)**:
   - Uses verified 2026Q2 (`기준_년분기_코드 = 20262`, `CS100010` 커피-음료) rows from `OA-15577` (stores) and `OA-15572` (estimated sales).
   - Preserves raw area names verbatim (including `종로?청계 관광특구` for code `3001494`).
   - Preserves raw sales (`당월_매출_금액`) and transactions (`당월_매출_건수`) with explicit notice that period aggregation semantics in the quarter-keyed table are unconfirmed (never divided by 3 or by store count).
   - Missing sales rows in `OA-15572` (e.g., `3110001` 이북5도청사, `3110005` 세검정, `3110007` 사직공원) remain `null` (never coerced to `0`) and cannot produce a data-derived rank or cashflow.
2. **Deterministic 36-Month Cashflow & Reserve Gate (`src/domain/cashflowEngine.js`)**:
   - `Initial available cash (C0) = budget - locked deposit - opening expenditure` (deposit is never a monthly expense).
   - **10% Reserve Gate**: `C0 >= 10%` of original budget (`C0 * 10 >= budget`).
   - **Conserved KRW Rounding Convention**:
     - `monthlySales = Math.round(avgTicket * transactionsPerDay * tradingDaysPerMonth)`
     - `monthlyVariableCost = Math.round(monthlySales * variableCostRatio)`
     - `monthlyContribution = monthlySales - monthlyVariableCost`
     - `monthlyOperatingCashChange = monthlyContribution - Math.round(monthlyFixedCost)`
   - Reports **Zero-Cash Boundary Month** (`endingCash <= 0`) and **First Negative-Cash Month** (`endingCash < 0`) separately.
3. **Seeded 1,000 Assumed Scenario Batch**:
   - Deterministic PRNG (`xmur3` + `Mulberry32`) over bounded perturbations; preserves exact base values under zero spread and reports `distinctScenarioCount`.
   - Relative variation of zero transactions stays zero. Counts describe chosen assumptions, not measured probabilities of store survival. The monthly model uses constant assumptions and has not been calibrated to individual stores.
4. **Optional Bounded Server-Side Gemini Proposal (`src/services/geminiProposalService.js`)**:
   - Calls `https://generativelanguage.googleapis.com/v1beta/interactions` using `GEMINI_API_KEY` from server environment only and configurable `GEMINI_MODEL` (default `gemini-3.8-flash`).
   - Enforces per-instance in-flight limit (`1`), lifetime call quota (`10`), request timeout, output token budget, sanitized errors, and deterministic verifier check. Returns explicit `unconfigured` status (`HTTP 503`) when `GEMINI_API_KEY` is absent. The quota resets on restart and is not a project-wide billing cap.

## Local Setup & Commands (Node 20+, Zero Dependencies)

```bash
# Run acceptance & HTTP smoke tests (Node 20+ built-in test runner)
npm test

# Start the server locally on http://localhost:8080
npm start

# Optional: enable live Gemini bounded proposal endpoint (server-only env var)
GEMINI_API_KEY="your_api_key_here" GEMINI_MODEL="gemini-3.8-flash" npm start
```

## Container and Cloud Run

The production image uses Node 22. The container recipe is supplied; a container build and Cloud deployment still require separate verification. The application serves a 12-area cafe sample; the full 22-quarter public archive stays in GitHub and is excluded from deployment uploads.

```bash
# Build container locally (excludes 111MB raw data/CSVs, logs, and credentials via .dockerignore)
docker build -t a-thousand-stores:local .
docker run --rm -p 8080:8080 a-thousand-stores:local
```

After authenticating to the intended Google Cloud project, deploy from this repository with an explicit target. This command creates a public service; the Gemini endpoint stays unavailable until a server-side key is configured.

```bash
GDH_PROJECT_ID="your-authorized-project-id"
GDH_REGION="asia-northeast3"
gcloud run deploy a-thousand-stores \
  --source . \
  --project "$GDH_PROJECT_ID" \
  --region "$GDH_REGION" \
  --allow-unauthenticated \
  --min-instances 0 --max-instances 1 \
  --cpu 1 --memory 256Mi --concurrency 8 --timeout 30s
```

Configure `GEMINI_API_KEY` on the server, preferably through Secret Manager; never put it in client code, Git or a shared prompt. Verify `/api/health`, then make one deliberate live proposal request. A configured-key flag or a mocked test is not evidence that the provider call succeeded. The [official Cloud Run guide](https://docs.cloud.google.com/run/docs/quickstarts/build-and-deploy/deploy-nodejs-service) covers required project access and deployment setup.

## Data Attribution & License

- **Datasets**: 서울시 상권분석서비스(점포-상권 `OA-15577`, 추정매출-상권 `OA-15572`)
- **Copyright Holder**: Seoul Metropolitan Government (서울특별시)
- **Provider**: Seoul Credit Guarantee Foundation (서울신용보증재단)
- **License**: Korea Open Government License Type 1 (attribution required; see [LICENSE_NOTICE.txt](LICENSE_NOTICE.txt) and [data/seoul/README.md](data/seoul/README.md))
