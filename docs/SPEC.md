# 기획서 · Gemini·Antigravity 입력용: A Thousand Stores — Build Spec (Claude, 10/16 11:05)

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
| Sol (에어 ChatGPT 앱 · GPT Pro) | 피치 3회: 12:05 뼈대(숫자 자리 비움), 14:30 녹화 전 검토, 15:10 심사 Q&A 6개 | §1, §10, §11 | 피치 90초 대본, Q&A 답 6개 (호출마다 태현 승인, 3회 이내) | 검증 안 된 성과 문장('생존확률 87%' 등), 크론 · 백그라운드 |
| Instinct (에어 브라우저 · Perplexity Pro 조회) | §12 미결 항목 사실 조회(Track 규정, 외부 모델 허용 범위, data.go.kr 키), 막힘 시 공식 문서 · 오류 조회, 확인됨/미확인 라벨 | §6(레인 2 자료), §12 | 질문 1개 = 출처 1개 = 확신도 1개, 11:20 멘토 질문 3개 정리 | 판단 대행, 새 제품 탐색 |
| Codex (에어 · 대기) | Antigravity 레인이 30분 넘게 막힐 때만 패치 제안(적용은 에이전트에게 지시) | §4, §5 | 패치 제안 diff | 동시 작성, main 수정 |

- 공통 규칙: 완결성 · 무결성이 기능보다 먼저다. 끝 상태는 DONE/FAIL/BLOCKED 셋 중 하나, 재생 결과는 '재생' 표시, 숫자마다 출처 태그. 제품 코드와 검사 코드는 11:20 이후에만. 키 · gcplab 계정 정보는 프로에만, 어떤 대화에도 붙이지 않는다. 외부 발송은 없다.
- 에스컬레이션: 15분 막히면 Leo에게, Leo는 태현에게 '자른다 / 바꾼다 / 기다린다' 셋 중 하나만 묻는다. 30분 이상 혼자 붙잡지 않는다.
- 이 표는 최종판 탭 '장비 · 에이전트 요약'과 같은 배치다. 바뀌면 이 표만 고치고 최종판 탭 맨 아래에 한 줄 남긴다.

쓰는 법(태현): ① 11:30 스파이크는 AI Studio(gemini-4-argon)에 §5와 §6만 붙여 백테스트 스파이크 코드를 요청한다. ② 11:20 저장소를 만들면 이 탭 전체를 docs/SPEC.md로 저장한다(세션 폴더 spec/SPEC.md에 같은 내용의 파일이 있다). ③ 12:00 Antigravity 첫 메시지는 작전 탭의 킥오프 프롬프트이고, 그 첫 줄에 'Read docs/SPEC.md and AGENTS.md first'를 넣어 이 문서를 가리킨다. 제품 코드는 11:20 이후에만 쓴다. 이 문서는 사양이지 코드가 아니다.

원칙: 완결성(루프가 끝까지 닫힌다)과 무결성(숫자는 코드가 내고 모델은 판정기를 못 만진다)이 모든 기능보다 앞선다. 아래 영어 본문이 모델이 읽는 정본이고, tests/와 어긋나면 tests/가 이긴다.

## 0. Read me first (build agent)

- You are Gemini 4 Argon inside Antigravity. Product owner: Taehyeon (the only approver of scope, shared types and test changes). Independent verifier: Claude Code (owns tests/). Three lanes: A1 engine/, A2 loop/ + data/, A3 web/. shared/ freezes at 12:15 KST. Dev window 11:20-15:20, G1 13:10, G2 14:00, freeze 14:25, submit 15:05.
- Completeness before features: every run ends in exactly one state, complete / failed(reason) / stopped(reason). No partial numbers are ever shown as final. A replayed or cached result is labeled 'replay' on screen and in logs.
- Integrity before features: the deterministic engine computes every number. You emit JSON patches only. You never read, call or edit the oracle (checks, expected values, result numbers, fixtures, label rules). Every number on screen carries a source tag. runs/<run-id>/ is append-only and records run ID, input hash (sha256), engine version (git short SHA).
- If this spec and tests/ disagree, tests/ wins: write the conflict under AGENTS.md > Lessons and stop. If a test looks wrong, do not fix it; Taehyeon decides.
- Your first reply to the kickoff is not code: restate the goal, list assumptions, answer the edge cases, propose a 55-minute plan per lane, name the three riskiest items and the acceptance test that catches each. Write code only after 'go'.

## 1. Product

- One line: Before you sign the lease, live a thousand futures of your store. Most of them fail. Keep the designs that survive and the one measurement that flips the answer.
- User: a first-time founder about to open a cafe in one Seoul district with one budget. Job: decide whether to sign now, hold, or go measure one thing first.
- What the user sees in 3 minutes: enter district, trade, budget and the store condition (5 minutes of input) > a survival landscape of 1,000 variants over 36 months > exactly one cliff (the assumption at which the #1 design flips) > exactly one next measurement (a 7-day action) > optional adversarial rounds table > a decision (Proceed / Hold / Measure) > export to Docs/Sheets or CSV. A status bar always shows run ID, input files, input hash, engine SHA, tokens and the gate log.
- Non-goals: no financial advice, no lease or loan recommendation, no external actions (no contracts, payments, messages), no real-world probabilities. Scenario frequencies are called 'scenario frequency', never 'survival probability'. This is a rehearsal tool.
- Why Gemini 4 Argon is necessary: a human compares two or three designs; the model generates 1,000 structurally different designs and, in the adversarial rounds, designs the shocks that kill the survivors. If a random/grid search with the same budget finds as many new failure families, the UI calls the loop an 'explorer' and drops the AI-native claim (AT-09).

## 2. Scope by priority

| P | Item | Done when | Deadline |
|---|---|---|---|
| P0 | Input form + public data loaders (Seoul 상권분석 22 quarters, data.go.kr 상가정보/건축물대장 or on-site values) with source tags | Canonical Input JSON with hash; every value has a source tag | 12:45 |
| P0 | Deterministic engine: 36-month cash flow, constraints, death classification, landscape, cliff, next measurement, random-search baseline | AT-03..AT-08 green on the fixed input; 1,000 x 36 <= 2.0 s | 13:10 (G1) |
| P0 | Variant generation: Argon Store Designer emits 1,000 JSON patches; validator rejects forbidden paths | AT-03, AT-10 green; token accounting per call | 13:10 |
| P0 | Backtest gate: calibrate on 2021Q1-2024Q4, hidden holdout 2025Q1-2026Q2; labels 보정됨/미보정 | AT-01, AT-02, AT-15 green or the 미보정 path is active | 13:40 |
| P0 | Screens 1-4 + 6 (input, landscape, cliff, next measurement, decision + export) and the status bar | AT-12, AT-14 green on the deployed URL | 14:00 (G2) |
| P0 | Cloud Run deploy, keys server-side only, secrets scan | AT-11 green; URL opens in an incognito window | 14:00 |
| P1 | Adversarial rounds (Bankruptcy Designer vs Store Designer, cap 3) + rounds table | AT-13 green or recorded as not run | 14:25 |
| P1 | 10,000 mode: 500 Argon design families x 20 deterministic parameter expansions = 10,000 variants; failure-family saturation curve at N = 1,000 / 3,000 / 10,000 | Runs once after G2 on the fixed input; screen label '500 AI design families x 20 variations'; AT-16 green or recorded as not run | 14:25 |
| P1 | Peak-hour queue mini-sim, Sheets export, Maps grounding card (off the core path) | Each one shippable alone; none blocks P0 | 14:25 |
| P2 | Multiple districts, side-by-side comparison, saved sessions | Not today unless P0 and P1 are green by 14:10 | - |

## 3. Architecture

- Stack (confirm at 12:00): Node 20 + TypeScript, npm workspaces: engine, loop, data, web, shared, tests. Engine is a pure TS package that runs both in a Web Worker in the browser and on Cloud Run (same code); AT-05 timing is recorded in both places.
- Server: one Cloud Run service (Node) exposing POST /run, GET /runs/:id, POST /patches (Argon calls happen here only). API keys come from the Cloud Run environment or Secret Manager; never in the client bundle, git or logs. Outbound allowlist: Gemini API, Grounding with Google Maps (P1), Seoul Open Data Plaza, data.go.kr.
- Client: web/ (Vite + TypeScript; React allowed, keep it small). All numbers rendered from RunResult only; the client never computes money.
- Models: gemini-4-argon with thinking_level 'high' for Store Designer and Bankruptcy Designer design steps, 'medium' for batch patch generation and screen text; gemini-3.8-flash for leaf tasks (CSV normalization, label strings). Do not set temperature, top_p, top_k or thinking_budget (Argon rejects them). Use background=True when an output may exceed 65,536 tokens. The 1M context means you pass the whole public data file to the model when it needs it, not a summary.
- Data flow: input form > loaders > canonical Input JSON (hash) > Store Designer (Argon) emits 1,000 patches > validator (forbidden paths, schema) > engine runs 1,000 x 36 > gates (backtest, budget/reserve, P&L recomputation, baseline, holdout) > landscape / cliff / next measurement > (P1) adversarial rounds > decision > export. The status bar reads runs/<run-id>/ only.

| Folder | Lane | Contents | Never |
|---|---|---|---|
| engine/ | A1 | 36-month simulator (seeded), constraint checks, death classification, landscape, cliff, next measurement, random-search baseline, adversarial round orchestrator, backtest runner | network calls; reading loop/ or web/ |
| loop/ | A2 | Argon roles as JSON patches (Store Designer, Bankruptcy Designer), patch validation, retry/timeout policy, token accounting per call | engine formulas; writing results |
| data/ | A2 | Loaders for Seoul 상권분석 (22 quarters; 2026 addition separated), data.go.kr 상가정보/건축물대장, on-site form; each returns rows + source + hash | personal data; company data; unlabeled synthetic values |
| web/ | A3 | Screens 1-6, status bar, export | any money computation; hiding a failed state |
| shared/ | all (frozen 12:15) | Types, schema, forbidden-path list, seasonality table, assumption defaults with source tags | changes without Taehyeon's written approval |
| tests/ | Claude Code | AT-01..AT-15, fixtures, expected values, holdout file (hashed) | edits by the build agent |
| infra/ | Taehyeon | Cloud Run config, deploy script, secrets scan | keys in files |
| docs/ runs/ | all | SPEC.md, demo script, README, decision log; runs/<id>/ append-only logs | rewriting past run logs |

## 4. Shared contracts (shared/, frozen at 12:15)

- Input { district: string; trade: 'cafe'; budgetKRW: number; horizonMonths: 36; seed: number; store: StoreCondition; market: MarketSeries; sources: SourceTag[] }
- StoreCondition { floorAreaM2; seats; rentKRW; depositKRW; fitoutKRW; equipmentKRW; staffCount; hoursPerDay; pricePerCupKRW; cupsPerDayBase; cogsRatio; openingMonth }  // each field carries a SourceTag
- SourceTag { field: string; kind: 'public' | 'onsite' | 'computed' | 'assumed' | 'synthetic'; name?: string; date?: string; url?: string }
- MarketSeries { quarters: Quarter[] }  Quarter { q: '2021Q1'..'2026Q2'; openRate; closeRate; estSalesKRW; storeCount }  // 2025Q1-2026Q2 live only in tests/holdout and are never read by calibration code
- Variant { id: string; parentId?: string; patches: Patch[] }  Patch { path: string; op: 'set' | 'add' | 'mul'; value: number | string; by: 'StoreDesigner' | 'BankruptcyDesigner' | 'Random' }
- Shock { id; month; kind: 'rentUp' | 'demandDown' | 'competitorOpen' | 'staffLoss' | 'supplyCostUp' | 'closureWeek'; magnitude: number; durationMonths: number }
- MonthRow { m; revenue; cogs; rent; labor; other; cash; cumPnL }  RunResult { runId; inputHash; engineSha; variantId; months: MonthRow[]; aliveMonths; deathCause?: 'cashBelowZero' | 'reserveBreach' | 'constraintReject'; failureFamily: string; nonDominated: boolean }
- Gate { name: 'backtest' | 'budgetReserve' | 'pnlRecompute' | 'baseline' | 'holdout' | 'G1' | 'G2'; passed: boolean; value: number; threshold: number; at: string }
- RoundLog { round: 1 | 2 | 3; shocks: Shock[]; deaths: number; newFailureFamilies: number; nonDominatedSurvivors: number; stopReason?: 'roundCap' | 'timeCap' | 'noNewFamily' | 'error' }
- RunStatus { state: 'complete' | 'failed' | 'stopped'; reason?: string; replay: boolean; runId; inputHash; engineSha; tokens: { perCall: TokenRow[]; total: { input; output } } }
- Forbidden patch paths (validator rejects and logs): tests/**, shared/expected/**, RunResult.*, Gate.*, label rules, store.budgetKRW, reserveRatio, seasonality table, any path outside StoreCondition (Store Designer) or Shock (Bankruptcy Designer). Exactly one of S (shocks), P (store patches), O (oracle) may change per step, and O never changes at runtime.

## 5. Engine spec (engine/, deterministic)

- Monthly loop for m = 1..36: revenue = cupsPerDay_m x pricePerCupKRW x 30 x seasonality[month] x demandMult(shocks, m); cogs = revenue x cogsRatio; labor = staffCount x wageKRW (default 2,400,000 per month, tag 'assumed'); other = utilities + marketing = 6% of revenue (tag 'assumed'); rent fixed; cash_m = cash_{m-1} + revenue - cogs - rent - labor - other.
- Start: cash_0 = budgetKRW - depositKRW - fitoutKRW - equipmentKRW. The deposit is locked cash (returned at month 36), never an expense. Constraints: deposit + fitout + equipment <= budget, and cash_0 >= 0.10 x budget (reserve). A variant that violates a constraint is 'constraintReject' (logged, not counted as a death).
- Demand baseline: cupsPerDayBase = estSalesKRW(district, latest calibrated quarter) / pricePerCupKRW / 30 / storeCount, tagged 'computed' with the public source. On-site values override with tag 'onsite'.
- Death: cash_m < 0 -> dead at m, cause 'cashBelowZero'. cash_m < reserve for 3 consecutive months -> 'reserveBreach' (counts as death for the landscape, shown separately).
- Determinism: seed -> mulberry32 (or seedrandom); every random draw comes from this PRNG; same Input + seed -> identical SHA-256 of the results JSON (AT-06). No Date.now() or Math.random() in engine/.
- Landscape: per variant (aliveMonths, cumPnL at 36 or at death, minCash). Failure family = rule-based key (deathCause, dominant cost line at death, month bucket 1-6/7-18/19-36). No ML clustering.
- Non-dominated set: Pareto front on (aliveMonths up, cumPnL up, minCash up). #1 design: lexicographic (aliveMonths, cumPnL, minCash, id) so ties never flicker.
- Cliff: for each assumption a in {pricePerCupKRW, cupsPerDayBase, rentKRW, cogsRatio, staffCount, seasonality amplitude, shock magnitude}: sweep -30%..+30% in 11 steps, recompute #1; boundary(a) = smallest |delta| at which #1 changes. Report exactly one cliff = the a with the smallest relative boundary; verify by re-running at boundary -1 step and +1 step (AT-07 requires the #1 IDs to differ).
- Next measurement: the cliff's assumption. Priority proxy = (1 / relative boundary) x uncertaintyWidth(a) where width is the public-data quarter range for 'public', +/-5% for 'onsite', +/-30% for 'assumed'. Output is one sentence naming the variable and a 7-day action (e.g., count cups per day at a comparable store for 7 days). AT-08: perturbing a different assumption by the same width must not flip #1.
- Backtest gate: calibrate two parameters (demand level multiplier, closure sensitivity) on 2021Q1-2024Q4 so simulated yearly open and close rates for the district and trade match the public series within +/-5 percentage points per year. The holdout 2025Q1-2026Q2 lives in tests/holdout (hashed) and is never read by calibration; the holdout check runs at every gate (AT-15). Labels: 보정됨 when both pass, else 미보정 (distributions hidden, assumption table shown).
- Baseline: random + grid search over the same patch space with the same budget (1,000 variants). Compare count of new failure families and non-dominated designs against the Argon set (AT-09). If the baseline is >= Argon, the UI says '탐색기' instead of AI-native.
- Performance: 1,000 x 36 in <= 2.0 s (median of 5) in a Web Worker and on Cloud Run. Use Float64Array per field, no per-month object allocation in the hot loop, no JSON parsing inside the loop.
- N is a parameter: default 1,000 (all gates and the demo), 10,000 in the P1 mode. Store per-variant aggregates only (aliveMonths, cumPnL, minCash, deathCause, failureFamily, nonDominated) in typed arrays; keep MonthRow arrays only for the 50 sampled variants (AT-04) and the #1 design, so the payload stays near 1 MB at 10,000. Measured on the Air (Node 20, Apple M2, toy 36-month loop, typed arrays): one run 0.4 ms at N = 1,000, 5.9 ms at 10,000, 57.7 ms at 100,000; a 77-run cliff sweep 0.44 s at 10,000. Target in 10,000 mode: 10,000 x 36 <= 2.0 s including landscape aggregation.
- Adversarial rounds (P1, orchestrated in engine/, never agent-to-agent): round r = 1..3: Bankruptcy Designer proposes <= 5 shocks (JSON) targeting the current survivors -> engine runs -> Store Designer proposes <= 1 mutation per surviving failure family -> engine runs -> append RoundLog. Stop at r = 3, at 90 s per round, or when newFailureFamilies = 0; stopReason is always written. Oracle file hashes must be identical before and after (AT-13).
- Saturation curve (10,000 mode, P1): run the same pipeline at N = 1,000, 3,000 and 10,000 from the same seed family and record, at each N, the number of distinct failure families and non-dominated designs; plot both against N. If the failure-family count stops growing before 10,000, the screen says 'saturated at N = ...'; if it is still growing at 10,000, it says so. This is evidence for why N matters, not a claim.

## 6. Spike 11:30-12:00 (what to build first, in AI Studio or Antigravity)

- Lane 1 (stores): spike/backtest.ts (or .py). Load the 22-quarter 상권분석 file; implement the monthly loop of §5 for one base store; calibrate the two parameters on 2021-2024; print per-year open/close error in pp and the wall time for 1,000 variants x 36 months. Pass = every year within 5 pp and time <= 2.0 s. Output is a two-line judgment table that Taehyeon pastes into the execution tab at 12:00.
- Lane 2 option B (battery): spike/battery.py. scipy.io.loadmat(simplify_cells=True) on NASA B0005, B0006, B0007 (168 discharge cycles each, 24 C) to fit a calendar + cycle capacity-fade model; predict B0018 (132 cycles) and print max capacity error in %. Pass = <= 3%. The copy lives in the Air session folder nasa_battery/ (36 of 38 .mat files load; B0050/B0052 do not).
- Lane 2 option A (ReScene): one 12 s dashcam clip -> 3D reconstruction -> reprojection IoU; pass = IoU >= 0.4 (see the report tab, 2순위).
- Rule: stores pass -> stores. Stores fail and lane 2 passes -> lane 2. Both fail -> ReScene in human-assisted detection mode. No product switch after 12:00; only scope cuts.

## 7. Loop spec (loop/, data/)

- Loaders return { rows, source: { name, date, url? }, hash }. Seoul 상권분석: 22 quarters, the 2026 addition is a separate file and tagged. data.go.kr 상가정보/건축물대장: server-side key; if no key by 12:00, the floor area comes from the on-site form (tag 'onsite'). On-site form: rent, deposit, fit-out quote, floor area, seats.
- Store Designer prompt: system message = the StoreCondition schema, the forbidden-path list, the budget, and 'output a JSON array of Variant with 1..4 patches each; change only StoreCondition fields; no results, no labels'. 10 calls x 100 variants, up to 4 in parallel, thinking_level medium. Validate with a JSON schema; invalid items are rejected and logged, never repaired silently.
- Bankruptcy Designer prompt (P1): system message = the Shock schema, the current survivors summary (ids, aliveMonths, failure families), 'output <= 5 shocks that would kill the most survivors; no results, no labels'. thinking_level high.
- Reliability: timeout 30 s per call, retry <= 2 with backoff. The run completes with the valid subset if >= 900 variants validated; otherwise state = failed(reason: 'variants < 900'). A timeout mid-batch never hangs the UI: the run reports partial batch counts in the gate log.
- Token accounting: read usage metadata per call (input, output), store in runs/<id>/tokens.json, show per call and total in the status bar; the total must equal the API usage sum (AT-14).
- Caching and replay: results are cached by inputHash + engineSha. Any cached render is labeled 'replay' in the status bar and in runs/<id>/status.json. Live demo runs are fresh.
- 10,000 mode generation (P1): Argon emits 500 design families as structural patches (seat/area class, price tier, staffing pattern, opening month, equipment level) in 5 calls x 100; the engine expands each family into 20 variants by seeded jitter of the numeric StoreCondition fields within +/-15% (deterministic from seed + family id). Families go through the same validator and forbidden-path list; expansions can never change budget or reserve. The screen and the logs call the set '500 AI design families x 20 parameter variations', never '10,000 AI-generated designs'.

## 8. UI spec (web/)

- Screens: 1 Input (district, trade, budget, store condition, on-site values; every field shows its source tag). 2 Landscape (scatter of 1,000 variants: aliveMonths vs cumPnL, survivors highlighted, failure-family legend, non-dominated set outlined). 3 Cliff (one card: assumption, boundary value, #1 before and after). 4 Next measurement (one card: variable, 7-day action, why it flips the answer). 5 Rounds table (P1: round, shocks, deaths, new families, survivors, stop reason). 6 Decision: Proceed / Hold / Measure, then Export (Docs/Sheets or CSV).
- Status bar (always visible, AT-14): run ID, input file names, input hash (sha256 first 8), engine SHA (git short), tokens per call and total, gate log with timestamps (backtest, budget/reserve, P&L recomputation, baseline, holdout, G1, G2), run state (complete / failed / stopped with reason), 'replay' badge when applicable.
- Required wording: 'scenario frequency', 'rehearsal, not advice', a source tag on every number (public dataset name and date / on-site / computed / assumed / synthetic). Forbidden wording: 'survival probability', 'you should sign', 'you should borrow', any percent presented as a real-world probability.
- Failure states are shown, never hidden: the 미보정 path hides distributions and shows the assumption table; the '탐색기' label replaces AI-native when the baseline wins; 'Hold: insufficient evidence' is a valid and complete end state and appears in the demo.
- Design: one column, 16 px gutters, works at 1280 px and on a phone; charts via a small library (uPlot or Chart.js); no 3D, no animation that delays numbers.
- 10,000 mode rendering (P1): the landscape scatter uses canvas (uPlot), colored by design family; a second small chart shows the saturation curve (distinct failure families and non-dominated count vs N = 1,000 / 3,000 / 10,000); the label '500 AI design families x 20 variations' sits next to the N selector.

## 9. Gates and acceptance (summary; tests/ is the source of truth)

| Gate | Time | Must be green | Who judges |
|---|---|---|---|
| G1 | 13:10 | Engine end to end on the fixed input; AT-03..AT-07 | Claude Code |
| Backtest | 13:40 | AT-01 (or the AT-02 미보정 path active); AT-15 holdout | Claude Code |
| G2 | 14:00 | Deployed URL with a first-seen real input; AT-01, AT-05, AT-11, AT-12, AT-14 | Aside (user path), Claude Code |
| Freeze | 14:25 | P0 defects only; AT-13 recorded as green or 'not run' | Taehyeon |
| Submit | 15:05 | AT-03..AT-07, AT-10..AT-12, AT-14 all green; failures recorded as failures | Taehyeon |

- AT-01 backtest +/-5 pp per year 2021-2024 -> 보정됨 label. AT-02 deliberately wrong reference -> 미보정 label, distributions hidden, demo still finishes. AT-03 1,000 variants + 5 injected violations: budget, reserve >= 10%, seats/area >= 0; violations rejected, logged, not counted as deaths.
- AT-04 independent spreadsheet-style recomputation of 50 sampled variants matches to <= 1 KRW per month; deposit classified as locked cash. AT-05 1,000 x 36 <= 2.0 s (median of 5, browser and Cloud Run). AT-06 same seed -> same SHA-256; different seed -> constraints and labels still hold.
- AT-07 exactly one cliff; re-running on both sides flips #1. AT-08 next measurement points at the cliff variable; a same-width perturbation of another assumption does not flip #1. AT-09 Argon set >= random/grid baseline (same N, same budget) on new failure families and non-dominated count, else '탐색기'.
- AT-10 five forbidden-path patches rejected with reasons; result hash unchanged. AT-11 no key strings in bundle, git history, logs; outbound only to the allowlist; no payment/mail/contract code paths. AT-12 incognito, first-seen real input, zero errors end to end, source tag on every number, zero 'survival probability' strings, exported file opens.
- AT-13 three adversarial rounds logged in runs/<id>/rounds.json with stop reason; one of S/P/O per step; oracle file hashes unchanged. AT-14 status bar shows run ID, input file names, input hash, engine SHA, tokens (= API usage sum), gate log; two runs have different IDs and reflect the swapped file. AT-15 after every merge to main the hidden holdout 2025Q1-2026Q2 stays within +/-5 pp, else the merge is marked FAIL.
- AT-16 (10,000 mode, P1): 500 families x 20 expansions = 10,000 variants, all passing the AT-03 constraints; 10,000 x 36 <= 2.0 s (median of 5); the saturation curve has three points (N = 1,000 / 3,000 / 10,000) whose failure-family and non-dominated counts come from the engine log; the screen label reads '500 AI design families x 20 variations'. If not run by 14:25, recorded as 'not run'.

## 10. Demo script (3 minutes, numbers are placeholders until measured)

- 0:00-0:20 Problem in one sentence; show the input: Seongsu-dong cafe, budget KRW 120,000,000, floor area from the building register, rent and deposit from an on-site quote. Every field shows its source tag.
- 0:20-1:00 Run: 1,000 variants x 36 months in 1.x s (status bar: run ID, input hash, engine SHA, tokens). Landscape: N survive, failure families named.
- 1:00-1:40 Cliff: the #1 design flips at (assumption, value). Re-run both sides live to show the flip. Next measurement: one 7-day action.
- 1:40-2:20 Backtest gate: 2021-2024 reproduced within x pp (보정됨) and the hidden 2025Q1-2026Q2 holdout check. Then the adversarial rounds table if it ran (P1) with the stop reason.
- 2:20-2:50 Decision: the user presses Hold ('insufficient evidence until the measurement'). Export opens in Sheets. Show the failure state once (미보정 or 탐색기) on purpose.
- 2:50-3:00 Philosophy line: 'We never speak about the future until we have reproduced the past.' Model IDs and run time on screen.
- If the 10,000 mode ran: 10 s on the saturation curve, phrased as '500 AI design families x 20 variations; new failure families stopped growing at N = ...' (or 'still growing at 10,000', if that is what the log says).

## 11. Submission artifacts (English)

- Project Description, 5 sentences: problem; user; what is different (1,000 lived futures, backtest gate, one cliff, one measurement, adversarial rounds); what was actually built today (model IDs gemini-4-argon and gemini-3.8-flash, run time, gate results as measured); limits (district and trade scope, 미보정 cases, no advice).
- README: install, run (npm run dev), test (npm test, npm run test:accept, npm run backtest, npm run bench, npm run baseline, npm run adversarial, npm run secrets:scan), limits, roadmap, licenses of public data, synthetic labels.
- Video <= 3 minutes, YouTube unlisted (Drive fallback), labeled as a recording. Repo public at 14:45, no keys, LICENSE, AGENTS.md and docs/SPEC.md included.

## 12. Open decisions (fill at 12:00)

- Stack confirmed (Node 20 + TypeScript) and where AT-05 is measured (browser worker, Cloud Run, or both).
- Thresholds confirmed after the spike: +/-5 pp, 10% reserve, 2.0 s, baseline comparison method.
- data.go.kr key available or not (if not: on-site floor area, allowlist shrinks).
- Track 4 vs 3 per the mentor answer; external-model verification scope (Claude Code writes tests/ or only reviews).
- Lane 2 of the spike: ReScene or battery, decided at 11:20.
- Decided 11:25 KST (Taehyeon): option B. 10,000 mode is P1 (500 Argon design families x 20 deterministic parameter expansions) with the failure-family saturation curve at N = 1,000 / 3,000 / 10,000; the default and all gates stay at 1,000.
