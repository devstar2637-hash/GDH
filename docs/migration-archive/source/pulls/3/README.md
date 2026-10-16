# PR #3: A1: CLI run이 RunResult를 result.json으로 쓰게 함

Original: https://github.com/devstar2637-hash/GDH/pull/3
Author: devstar2637-hash
State: open
Head: cursor/cli-contract-2c06 (8d5026472d2ec45cdae42f81628181cff085cce6)
Base: main (d275e190604b0a2f7350be2e7a9097453082c075)

<!-- CURSOR_AGENT_PR_BODY_BEGIN -->
## 요약

`npx tsx engine/cli.ts run --input <file> --seed <n> --n <count> --out <dir>` 가 `<dir>/result.json` 을 `RunResult` 로 씁니다.

메인에 엔진과 `shared/` 가 빠져 있어 루프가 컴파일되지 않았습니다. `88b3616` 의 엔진을 되돌린 뒤 아래 계약을 맞췄습니다.

- `designs[]` 와 `results[]` 길이가 같고, 제약 위반(`constraintsOk=false`)도 결과에서 빠지지 않습니다.
- `50 <= n <= 1000` 이면 통과한 변형은 시뮬레이트된 `months[]` 를 유지합니다. 생존은 36개월, 사망은 사망 월까지입니다.
- `leaderDesignId`, `cliff.relativeDelta`, `status`(StatusBar: runId, inputFiles, inputHash 8자, engineSha, endState, replay, tokens, tokenTotal, gateLog)를 채웁니다.
- 초기 지출(outlay)은 보증금 + 인테리어비뿐입니다. 장비비, 월세, 인건비는 빼지 않습니다.
- 2025–2026 분기 6개는 `shared/` 에서 빼 `data/holdoutQuarters.ts` 로 옮겼습니다. 파라미터 적합은 2021–2024만 봅니다.

## 확인

`npm test` 17개 통과 (엔진 AT, 루프 AT, `engine/cli.contract.test.ts`). CLI 테스트는 위 명령을 `n=50`, seed 42, 위반 설계 1건으로 실행합니다.

## 계약에서 문서로 닫히지 않은 점

`tests/README.md` 의 "CLI contract" 절은 저장소와 git 이력에 없습니다. 이번 구현은 요청 항목과 기존 `RunResult` / `StatusBar` 타입을 기준으로 했습니다. 그 README가 나중에 생기면 그 문서가 우선입니다.

- SPEC §5는 초기 현금에서 장비비도 빼라고 합니다. 요청과 기존 엔진은 보증금+인테리어만 지출로 봅니다. 장비비는 설계 필드로는 남고 초기 현금에는 들어가지 않습니다.
- SPEC은 홀드아웃을 `tests/holdout` 에 두라고 합니다. 분기 행은 `data/holdoutQuarters.ts` 에 두었습니다. `shared/` 타입의 게이트 이름 `holdout` 과 `holdoutErrorPp` 필드는 상태바 계약이라 남겨 두었습니다. 분기 코드(20251–20262, 2025Q1–2026Q2)는 `shared/` 에 없습니다.
- `--n` 은 생성할 설계 수입니다. 입력의 `injectedDesigns` 는 뒤에 붙으므로 `designs.length` 는 `n + 주입 수` 일 수 있습니다. 입력에 `designs` 배열이 있으면 길이가 `--n` 과 같아야 하고 그 배열을 그대로 씁니다.
- `n > 1000` 이면 월별 행은 표본과 1위 설계만 남깁니다. 1만 개 전부에 36개월 행을 쓰면 페이로드가 SPEC의 1MB 한도를 넘습니다.
- `run` 은 입력에 `runAdversarial: true` 가 없으면 적대 라운드를 돌리지 않습니다. `rounds` 는 `[]` 입니다.
- 이 경로는 모델을 호출하지 않으므로 `status.tokens` 는 빈 배열이고 합계는 0입니다.

<!-- CURSOR_AGENT_PR_BODY_END -->

<div><a href="https://cursor.com/agents/bc-aa09ed66-a11c-56f6-afba-52ad80662c06?cursor_ref=pr_footer&cursor_cta=open_in_web"><picture><source media="(prefers-color-scheme: dark)" srcset="https://cursor.com/assets/images/open-in-web-dark.png"><source media="(prefers-color-scheme: light)" srcset="https://cursor.com/assets/images/open-in-web-light.png"><img alt="Open in Web" width="114" height="28" src="https://cursor.com/assets/images/open-in-web-dark.png"></picture></a>&nbsp;<a href="https://cursor.com/background-agent?bcId=bc-aa09ed66-a11c-56f6-afba-52ad80662c06&cursor_ref=pr_footer&cursor_cta=open_in_cursor"><picture><source media="(prefers-color-scheme: dark)" srcset="https://cursor.com/assets/images/open-in-cursor-dark.png"><source media="(prefers-color-scheme: light)" srcset="https://cursor.com/assets/images/open-in-cursor-light.png"><img alt="Open in Cursor" width="131" height="28" src="https://cursor.com/assets/images/open-in-cursor-dark.png"></picture></a>&nbsp;</div>



This is an archival record, not a new review or a recommendation to merge the historical branch.
