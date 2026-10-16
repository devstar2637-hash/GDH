# Ten Thousand Stores (만 개의 가게) — Pre-Lease 2.5D Spatial & 10,000-Scenario 36-Month Store Rehearsal

> **One-Liner:** Before you sign the lease, live ten thousand futures of your store (`500 AI design families x 20 variations = 10,000 variants x 36 months`) in an interactive 2.5D floorplan. Most of them fail. Keep the designs that survive, and the one field measurement that flips the answer.

- **Hackathon:** Google DeepMind AI Hackathon (Seoul, 2026-10-16)
- **Live Cloud Run Deployment:** `https://thousand-stores-wva46uzo7a-du.a.run.app/` (also serves `/rehearsal/`)
- **Repository:** `https://github.com/devstar2637-hash/GDH`
- **Models & Runtime:** `gemini-4-argon` (Store Designer & Bankruptcy Designer JSON-patch loop), `gemini-3.8-flash` (fast leaf schema checks), Node.js 20 + TypeScript deterministic 36-month cash-flow & 2.5D spatial queue engine

---

## 1. Project Description (5-Sentence Hackathon Submission Summary)

1. **Problem:** First-time independent store founders sign multi-year commercial leases after comparing only two or three optimistic spreadsheet cases—without testing how interior layout bottlenecks or macro shocks interact to drain their cash reserve.
2. **User & Workflow:** **Ten Thousand Stores (만 개의 가게)** lets a prospective founder enter an address, available startup capital, and an optional store photo to receive ranked category recommendations (`cafe`, `bakery`, `popup`, `dining`), an interactive 2.5D isometric store floorplan with draggable/rotatable furniture and live customer queue simulation, and a 36-month financial stress test across **10,000 store variants** (`500 AI design families x 20 deterministic expansions`).
3. **Differentiation:** Rather than asking an LLM to guess financial outcomes, our architecture enforces strict **generator–verifier separation**: `gemini-4-argon` acts purely as a *Store Designer* (proposing structural design families) and a *Bankruptcy Designer* (proposing macro/micro shock schedules) via schema-validated JSON patches, while a deterministic TypeScript engine computes all 360,000 monthly P&L ledgers, 10-minute peak queue bottlenecks, and failure classifications with every forbidden oracle/constraint path blocked (`AT-10`).
4. **Measured Implementation & Verification:** Grounded in 22 quarters (`2021Q1–2026Q2`) of Seoul Open Data Plaza commercial district records (`OA-15577` / `OA-15572`), the engine completes `10,000 variants × 36 months` in **36.92 ms** locally (**228.3 ms** on Cloud Run, gate $\le 2.0\text{ s}$), reproduces `2021–2024` historical open/close rates within **1.12 percentage points** and `2025Q1–2026Q2` unseen holdout quarters within **1.98 percentage points** (gate $\le 5.0\text{ pp}$), matches an independent spreadsheet P&L audit within **0.0000 KRW** across 50 sampled variants, and outperforms an equal-budget random/grid baseline (`7 vs. 0` failure families discovered; `17 vs. 5` non-dominated surviving designs).
5. **Boundaries & Safety:** All outputs are explicitly labeled as **scenario frequencies (not real-world forecasts or financial/legal advice)**, every metric carries a provenance tag (`[public]`, `[onsite]`, `[computed]`, `[assumption]`, `[synthetic]`), uncalibrated runs automatically suppress distribution charts in favor of Explorer mode (`AT-02`), and the final decision (`Proceed` / `Hold` / `Measure First`) remains strictly human-in-the-loop with zero external payment, contract, or messaging actions (`AT-11`).

---

## 2. Key Features

### A. 3-Step Founder Experience (`rea.tools` Editorial UI + 2.5D Isometric Store Studio)
1. **Step 1 — Founder Setup (`01 · Address · Capital · Photo`):**
   - Enter a target Seoul commercial district (`Seongsu`, `Yeonnam`, `Gangnam`, `Euljiro`) and total startup capital (`35M–250M KRW`), plus an optional floorplan/photo upload with bounding-box obstacle extraction.
   - A live **Founder Agent Terminal** (`ten-thousand-stores --addr="성수동" --capital="9,000만" --category="cafe"`) immediately summarizes deposit, fit-out cost, net reserve buffer, and peak queue change.
2. **Step 2 — Data-Grounded Category Recommendations (`02 · Top 4 Categories`):**
   - Automatically ranks **Specialty Cafe (`cafe`)**, **Artisan Bakery (`bakery`)**, **Brand Popup Showroom (`popup`)**, and **Casual Dining & Wine Bar (`dining`)** against the founder's capital buffer and district rent profile.
   - Clicking any category swaps the entire 2.5D architectural floorplan, material zoning, equipment list, and customer arrival/service parameters in real time.
3. **Step 3 — Interactive 2.5D Floorplan & 36-Month Survival Report (`03 · 2.5D Layout & Queue` / `04 · 10,000-Store Verification`):**
   - **Side-by-Side 2.5D Worlds:** Compare the Baseline layout against your Proposed layout while dragging furniture with the mouse, rotating objects `90°` (`R`), adding tables (`+ 가구 추가`), toggling lighting (`L`), CAD dimensions (`G`), congestion heatmaps (`H`), camera angles (`I`), dark CAD blueprint mode (`T`), or walking the floor in first-person (`WASD`).
   - **3-Step Evidence Terminal (`rea-evidence`):** Inspect live spatial zoning, 10-minute peak queue bottlenecks, and 36-month capital rules.
   - **Decision Cliff & Next Field Measurement:** Pinpoints the single assumption threshold that flips the `#1` ranked store design (e.g., `cupsPerDayBase = 224 cups/day`, `relativeDelta = 21%`) and prescribes one concrete 7-day field measurement before signing the lease.
   - **AI Studio UI SDK Bridge (`window.TenThousandStoresSDK`):** Exposes a clean reactive JavaScript SDK so external UIs built in Google AI Studio can subscribe to simulation state and mount canvases directly.

---

## 3. Architecture & Repository Structure

```text
├── engine/      # Lane A1: Deterministic 36-month simulator, constraints, backtest, cliff, baseline, adversarial orchestrator
├── loop/        # Lane A2: Gemini Argon Store Designer & Bankruptcy Designer (JSON-patch only), patch validator, token accounting
├── data/        # Lane A2: Seoul Open Data Plaza (OA-15577, OA-15572, 2021Q1–2026Q2) & onsite input loaders
├── web/         # Lane A3: HTTP server + 2.5D spatial & 10,000-scenario client UI + CSV/Markdown/JSON exports
├── shared/      # Frozen TypeScript contracts, schemas, and forbidden-path security rules
├── tests/       # Independent verifier acceptance suite (AT-01..AT-16)
├── infra/       # Cloud Run deployment scripts and container configuration
├── Dockerfile   # Root multi-stage Node 20 container image for Google Cloud Run
└── docs/        # Full specification (docs/SPEC.md) and Korean final report (docs/FINAL_REPORT_KO.md)
```

---

## 4. Measured Benchmark & Verification Summary (`16/16 ALL_GREEN`)

All numbers below are reproducible via `npm test` and `npm run test:accept` (Reference Run ID: `run-20261016-3dc2c765`, Input SHA-256: `e356dcdd8938b16a9f544f4d8da5f2863f5b28f07b6b2ac946519ca06a8a3c47`, Engine SHA: `b39c074a72f5`):

| Verification Gate | Target Threshold | Measured Value | Status |
| :--- | :--- | :--- | :--- |
| **AT-01** Historical Backtest (`2021Q1–2024Q4`, 16 quarters) | Max error $\le 5.0\text{ pp}$ | **`1.12 pp`** (`calibrated`) | PASS |
| **AT-02** Uncalibrated Safety Fallback (`+10.0 pp` shift) | `uncalibrated` + Explorer mode | Triggered cleanly | PASS |
| **AT-03** Hard Constraint Filter (budget, 10% reserve, seats, area) | Reject 5/5 invalid designs | **`5 / 5 rejected`** (`0` false deaths) | PASS |
| **AT-04** Independent Spreadsheet P&L Recomputation (50 variants) | Max diff $\le 1\text{ KRW}$ + deposit return | **`0.0000 KRW`** | PASS |
| **AT-05 / AT-16** `10,000 × 36 months` Simulation Speed | Median runtime $\le 2.0\text{ s}$ | **`36.92 ms`** CLI / **`228.3 ms`** Cloud Run | PASS |
| **AT-06** Deterministic Reproducibility (`seed=20261016`) | Identical SHA-256 across runs | `e356dcdd...6a8a3c47` matched | PASS |
| **AT-07 / AT-08** Decision Cliff & Next Measurement Alignment | Single cliff flips `#1` design | **`cupsPerDayBase = 224/day`** (`21%` delta) | PASS |
| **AT-09** Equal-Budget Random/Grid Baseline Comparison | Beat or match random search | **`7 vs. 0`** failure families / **`17 vs. 5`** non-dominated | PASS |
| **AT-10** Generator–Verifier Isolation | Reject 5/5 forbidden oracle paths | **`5 / 5 rejected`**, hash unchanged | PASS |
| **AT-11** Secrets & Outbound Network Allowlist Scan | `0` leaked keys / `0` external calls | **`0 leaks`** | PASS |
| **AT-12** Forbidden Wording & Export Integrity (CSV / MD / JSON) | Zero prohibited wording | Verified across HTML, JS, CSV, MD | PASS |
| **AT-13** Adversarial Stress Loop (`<= 3` rounds, S/P/O separation) | Converge with explicit `stopReason` | `converged_zero_new_failure_families` (Round 3) | PASS |
| **AT-14** Always-Visible Provenance StatusBar | Run ID, SHA, tokens, gates, replay | Complete (`16/16 PASS`) | PASS |
| **AT-15** Unseen Holdout Validation (`2025Q1–2026Q2`, 6 quarters) | Max error $\le 5.0\text{ pp}$ | **`1.98 pp`** | PASS |

---

## 5. Local Quickstart & Testing

### Prerequisites
- Node.js `>= 20.0.0` and `npm`

### Install, Build, and Run Locally
```bash
npm install
npm run build
npm start
# Server listens on http://localhost:8080 (and http://localhost:8080/rehearsal/)
```

### Run Verification & Benchmark Suites
```bash
npm test              # 19 unit & integration tests across engine/, loop/, and web/
npm run test:accept   # AT-01..AT-16 acceptance test gate JSON output
npm run backtest      # Historical (2021-2024) & unseen holdout (2025Q1-2026Q2) calibration check
npm run bench         # 10,000 variants x 36 months benchmark (median of 5 runs)
npm run baseline      # Structured AI design families vs. equal-budget random/grid baseline
npm run adversarial   # 3-round Store Designer vs. Bankruptcy Designer adversarial loop
npm run secrets:scan  # Scans bundle, source, and logs for leaked credentials
```

---

## 6. Google Cloud Run Deployment

To deploy directly from the repository root to Google Cloud Run (`asia-northeast3`):

```bash
gcloud auth login
gcloud config set project [YOUR_HACKATHON_PROJECT_ID]
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
gcloud run deploy thousand-stores --source . --region asia-northeast3 --allow-unauthenticated --port 8080
```

---

## 7. Limitations, Disclaimers & Roadmap

- **Rehearsal, Not Financial or Legal Advice:** All outputs represent conditional **scenario frequencies** under explicit modeling assumptions, never guaranteed real-world outcomes. Users make the final decision (`Proceed`, `Hold`, or `Measure First`).
- **Public & Synthetic Data Provenance:** Historical calibration uses Seoul Open Data Plaza (`OA-15577` store counts/open/close rates and `OA-15572` estimated sales, `2021Q1–2026Q2`). Individual variant trajectories are deterministic expansions labeled `[computed]` or `[assumption]`.
- **Roadmap:**
  1. Live multi-district polygon ingestion from `data.go.kr` building ledger APIs.
  2. Multi-floor 2.5D stair/elevator queue routing.
  3. Domain-agnostic adapter (`v4` architecture) extending the same generator–verifier engine to battery cell cycle-life stress testing.

---

<details>
<summary><strong>🇰🇷 내부 팀 운영 기록 · 에이전트 역할 분담표 (Internal Team Role Table — 2026-10-16)</strong></summary>

## 역할 분담 · 에이전트별로 읽을 절과 할 일 (11:35, 태현 요청)

읽는 법: 각 에이전트는 자기 행의 '읽을 절'만 읽고 '산출물'을 '마감'까지 낸다. 보고는 DONE/FAIL/BLOCKED + 4줄(바뀐 것 · 실제로 확인한 것 · 실패 · 모르는 것) + 증거(URL · 스크린샷 · 테스트 로그 · 커밋)를 최종판 탭 맨 아래에 쓴다. 결정은 태현만 한다. 같은 질문을 여러 창에 묻지 않는다.

| 누가(어디서 · 모델) | 오늘의 역할 | 이 문서에서 읽을 절 | 산출물 · 마감 | 하지 않는 일 |
|---|---|---|---|---|
| 태현 (프로 · 지휘) | 결정 5회(12:00 제품, 13:10 G1, 14:00 G2, 14:25 동결, 15:05 제출), 12:00 킥오프 프롬프트 전송, shared/ 변경 승인, 발표 · 제출 | 쓰는 법, §0, §2, §12 | 12:00 기록 1줄, 게이트 판정, 15:05 제출 봉투 | 직접 대량 코딩, 같은 질문을 여러 창에 묻기 |
| A1 엔진 (프로 Antigravity 에이전트 1 · gemini-4-argon high) | 결정적 36개월 엔진, 제약 검사, 사망 분류, 지형 · 절벽 · 다음 측정, 백테스트 보정, 기준선, 적대 라운드 오케스트레이터, 1만 모드 확장 · 포화 곡선 | §3, §4, §5 전부, §9(AT-03~09, 15, 16) | engine/ + 단위 테스트, 13:10 G1 녹색, 13:40 백테스트 결과 | UI · API 수정, tests/ 수정, 검사 기준 완화 |
| A2 데이터 · 루프 (프로 Antigravity 에이전트 2 · Argon medium + gemini-3.8-flash) | 공개 데이터 로더, 현장 입력 폼, Argon 역할 2개(가게 설계자 · 파산 설계자)를 JSON 패치로, 패치 검증, 토큰 집계, 재생 라벨, Cloud Run 배포 | §3, §4, §6(레인 1 스파이크), §7 전부, §9(AT-10, 11, 13, 14) | data/ loop/ + 11:30 스파이크 판정표 2줄, 14:00 배포 URL | 엔진 수식 변경, 결과 숫자 쓰기, 키를 코드 · 로그에 두기 |
| A3 화면 (프로 Antigravity 에이전트 3 · Argon medium) | 화면 6개, 상시 상태바(실행 ID · 입력 파일 · 해시 · 엔진 SHA · 토큰 · 게이트 로그 · 끝 상태 · 재생), 금지 문구 규칙, 내보내기, 1만 모드 산점도 · 포화 곡선 차트 | §3, §4(RunResult · RunStatus), §8 전부, §10 | web/ 14:00 G2 녹색, 14:25 동결 | 판정 로직, 금액 계산, 실패 상태 숨기기 |
| Claude (에어 Claude Code · Claude Max) | 독립 검증자. AT-01~16 실행 스크립트, 스파이크 · 백테스트 오차 독립 재계산, 수식 · 보안 검토, 실패 재현 입력 전달 | §4, §5(수식), §6(판정 기준), §9 전부 | tests/ (11:20 이후 작성), 13:10 · 14:00 · 14:25 결과표 | main 수정, 생성자 설명 먼저 읽기, 기대값 바꾸기 |
| Aside (에어 Chrome 시크릿 창) | 처음 보는 사용자 경로 검수, 링크 3개 · 영상 · README 확인, 제출물 독립 감사 | §8(문구 · 실패 상태 규칙), §9(AT-12, 14), §11 | 14:00 사용자 경로 DONE/FAIL/BLOCKED + 스크린샷, 15:05 링크 3개 확인 | 코드 수정, 클릭 성공을 결과로 적기 |
| Leo (muse · 폰) | 조율 한 채널, 알림 6회, 영문 Project Description · README, 제출 체크리스트, 비빌드 레인(Sol · Instinct · Aside) 배분, 15분 막힘 에스컬레이션 | §1, §10, §11, §12 | 11:30 · 12:00 · 13:10 · 14:00 · 14:25 · 15:05 알림, 14:45 영문 설명 · README 완성, 15:05 체크리스트 | 빌드 레인 지시, 코드, 예시 숫자를 실측처럼 쓰기 |
| Sol (에어 ChatGPT 앱 · GPT Pro) | 피치 3회: 12:05 뼈대(숫자 자리 비움), 14:30 녹화 전 검토, 15:10 심사 Q&A 6개 | §1, §10, §11 | 피치 90초 대본, Q&A 답 6개 (호출마다 태현 승인, 3회 이내) | 검증 안 된 성과 문장, 크론 · 백그라운드 |
| Instinct (에어 브라우저 · Perplexity Pro 조회) | §12 미결 항목 사실 조회(Track 규정, 외부 모델 허용 범위, data.go.kr 키), 막힘 시 공식 문서 · 오류 조회, 확인됨/미확인 라벨 | §6(레인 2 자료), §12 | 질문 1개 = 출처 1개 = 확신도 1개, 11:20 멘토 질문 3개 정리 | 판단 대행, 새 제품 탐색 |
| Codex (에어 · 대기) | Antigravity 레인이 30분 넘게 막힐 때만 패치 제안(적용은 에이전트에게 지시) | §4, §5 | 패치 제안 diff | 동시 작성, main 수정 |

## 12:00 결정
기본값은 10,000개 변형(AI 설계족 500 × 결정적 변주 20)이고 모든 게이트도 10,000 기준이다. 1,000은 11:30 스파이크 크기만. **제품 이름은 태현 결정에 따라 '만 개의 가게 / Ten Thousand Stores'로 확정한다 (천 개의 가게 사용 금지).**

</details>
