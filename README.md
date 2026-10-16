# GDH · A Thousand Stores (천 개의 가게) — Google DeepMind AI Hackathon, 2026-10-16

Before you sign the lease, live ten thousand futures of your store (500 AI design families x 20 deterministic expansions = 10,000 variants x 36 months). Most of them fail. Keep the designs that survive and the one measurement that flips the answer.

Built in one day with **Gemini 4 Argon inside Google Antigravity**: three Antigravity agents (engine, data + model loop, screen) write the product from [docs/SPEC.md](docs/SPEC.md) and [AGENTS.md](AGENTS.md); a deterministic TypeScript engine computes every number, and the model only emits JSON patches that a validator checks against a forbidden-path list. Independent acceptance tests live in `tests/` and are read-only for the build agents.

## 빌드 구성 · Antigravity 에이전트 3개 (10/16)

읽는 법: 각 에이전트는 자기 행의 '읽을 절'만 읽고 '산출물'을 '마감'까지 낸다. 보고는 DONE/FAIL/BLOCKED + 4줄(바뀐 것 · 실제로 확인한 것 · 실패 · 모르는 것) + 증거(URL · 스크린샷 · 테스트 로그 · 커밋). 결정은 태현만 한다.

| 누가(모델) | 오늘의 역할 | 이 문서에서 읽을 절 | 산출물 · 마감 | 하지 않는 일 |
|---|---|---|---|---|
| 태현 (지휘) | 결정 5회(12:00 제품, 13:10 G1, 14:00 G2, 14:25 동결, 15:05 제출), 12:00 킥오프 프롬프트 전송, shared/ 변경 승인, 발표 · 제출 | 쓰는 법, §0, §2, §12 | 12:00 기록 1줄, 게이트 판정, 15:05 제출 봉투 | 직접 대량 코딩 |
| A1 엔진 (Antigravity 에이전트 1 · gemini-4-argon high) | 결정적 36개월 엔진, 제약 검사, 사망 분류, 지형 · 절벽 · 다음 측정, 백테스트 보정, 기준선, 적대 라운드 오케스트레이터, 1만 모드 확장 · 포화 곡선 | §3, §4, §5 전부, §9(AT-03~09, 15, 16) | engine/ + 단위 테스트, 13:10 G1 녹색, 13:40 백테스트 결과 | UI · API 수정, tests/ 수정, 검사 기준 완화 |
| A2 데이터 · 루프 (Antigravity 에이전트 2 · Argon medium + gemini-3.8-flash) | 공개 데이터 로더, 현장 입력 폼, Argon 역할 2개(가게 설계자 · 파산 설계자)를 JSON 패치로, 패치 검증, 토큰 집계, 재생 라벨, Cloud Run 배포 | §3, §4, §6(레인 1 스파이크), §7 전부, §9(AT-10, 11, 13, 14) | data/ loop/ + 11:30 스파이크 판정표 2줄, 14:00 배포 URL | 엔진 수식 변경, 결과 숫자 쓰기, 키를 코드 · 로그에 두기 |
| A3 화면 (Antigravity 에이전트 3 · Argon medium) | 화면 6개, 상시 상태바(실행 ID · 입력 파일 · 해시 · 엔진 SHA · 토큰 · 게이트 로그 · 끝 상태 · 재생), 금지 문구 규칙, 내보내기, 1만 모드 산점도 · 포화 곡선 차트 | §3, §4(RunResult · RunStatus), §8 전부, §10 | web/ 14:00 G2 녹색, 14:25 동결 | 판정 로직, 금액 계산, 실패 상태 숨기기 |

- 공통 규칙: 완결성 · 무결성이 기능보다 먼저다. 끝 상태는 DONE/FAIL/BLOCKED 셋 중 하나, 재생 결과는 '재생' 표시, 숫자마다 출처 태그. 제품 코드와 검사 코드는 11:20 이후에만. 키 · 계정 정보는 저장소 · 로그 · 대화 어디에도 두지 않는다. 외부 발송은 없다.
- 에스컬레이션: 15분 막히면 태현에게 '자른다 / 바꾼다 / 기다린다' 셋 중 하나만 묻는다. 30분 이상 혼자 붙잡지 않는다.
- tests/는 독립 인수 테스트(AT-01~16)로 빌드 에이전트는 읽기만 한다. 사양과 tests/가 어긋나면 tests/가 이긴다.

## 문서

| 파일 | 용도 | 누가 읽나 |
|---|---|---|
| [docs/SPEC.md](docs/SPEC.md) | 빌드 사양 (영어 본문 + 역할표). 12:00 킥오프 프롬프트가 먼저 읽게 한다 | A1 · A2 · A3 |
| [AGENTS.md](AGENTS.md) | 저장소 규칙, 명령, 게이트, Lessons (12:15 동결) | 빌드 에이전트 전원 |
| [docs/KICKOFF_PROMPT.md](docs/KICKOFF_PROMPT.md) | 12:00 Antigravity 첫 메시지. 첫 줄에 "Read docs/SPEC.md and AGENTS.md first." | 태현 |
| [docs/FINAL_REPORT_KO.md](docs/FINAL_REPORT_KO.md) | 최종 보고서(한국어): 결론, 제품 한 장, 시간표 M0~M10, 리스크, 제출 봉투 | 전원 |
| [tests/README.md](tests/README.md) | 인수 테스트 AT-01~16 실행법과 판정 규칙 (DONE/FAIL/BLOCKED) | 전원 |

## 오늘의 시간표 (KST)

11:20 Cloud Run hello · 11:30~12:00 스파이크 2레인 · 12:00 제품 확정 + 킥오프 · 12:15 shared/ 동결 · 13:10 G1 · 13:40 백테스트 · 14:00 G2(배포 URL) · 14:25 동결 · 14:45 저장소 공개 + README · 15:05 제출.

## 12:00 결정

기본값은 10,000개 변형(AI 설계족 500 × 결정적 변주 20)이고 모든 게이트도 10,000 기준이다. 1,000은 11:30 스파이크 크기만. 제품 이름은 '천 개의 가게 / A Thousand Stores'로 둔다(태현 결정 전까지).

## 규칙 한 줄

완결성(루프가 끝까지 닫힌다)과 무결성(숫자는 코드가, 모델은 판정기를 못 만진다)이 기능보다 먼저다. 제품 코드는 11:20 이후에만. 키는 절대 저장소에 넣지 않는다.
