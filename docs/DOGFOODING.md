# Dogfooding 가이드 — v0.1.0 첫 1주차

> 이슈 트래커: [#10](https://github.com/must-goldenrod/think-prompt/issues/10)
>
> **목적:** 메인테이너가 think-prompt 를 실제로 본인 Claude Code 에 깔고 1주일 사용. 진짜 가치(D-032 두 근본 문제 해결)가 발생하는지 본인 데이터로 검증한다. 이 단계 통과 못하면 v0.1.1 이전에 외부 홍보 보류.

---

## 사전 셋업 (1회)

```bash
npm i -g think-prompt
think-prompt install                # 데몬 + 훅 자동 설정
think-prompt status                 # agent/worker/dashboard 모두 running 확인
```

**Claude Code 재시작 필수** — settings.json 의 훅 블록이 적용되려면 Claude Code 가 다시 settings 를 읽어야 한다.

```bash
think-prompt doctor                 # 훅·DB·데몬 체인별 진단
```

`✗` 나오면 GitHub 이슈 raise (재현 명령 + log path 첨부).

---

## 매일 (5분) — 자각 루틴

평소대로 Claude Code 사용. 그리고 하루 끝에:

```bash
think-prompt open                   # 대시보드를 브라우저에서 연다
```

대시보드에서 **딱 5가지만** 확인:

| 체크 | 무엇을 본다 | 판정 |
|------|-------------|------|
| 1. **TOP 5 낮은 점수** | 오늘 친 프롬프트 중 가장 점수 낮은 5개 | "맞다 이건 대충 쳤지" 자각이 오나? |
| 2. **자주 걸리는 룰** | R001~R012 중 본인이 반복해서 위반하는 룰 1~2개 | 본인의 _고착 패턴_ 이 보이나? |
| 3. **세션 타임라인** | 세션별 평균 점수의 시계열 | 시간 흐름에 따라 좋아지나/나빠지나? |
| 4. **빈 칸 / 깨진 데이터** | 점수 없음, 트랜스크립트 미파싱, 모델 응답 비어있음 | worker 가 제대로 돌고 있나? |
| 5. **첫 인상 vs 5일 후** | 1일차 대시보드 첫 인상과 5일차의 인상 차이 | 자각 효과가 "유지" 되나, "사라지나"? |

> 5번이 D-032 미션의 핵심. **자각 표면이 한 번 보면 끝나는 것 vs 매일 새로운 자각을 일으키는 것**의 차이를 본다.

---

## 매일 1번 (선택) — 인사이트 메모

본인이 발견한 _스스로의 프롬프트 안티패턴_ 을 한 줄 메모:

```bash
echo "$(date +%F)  R003 또 걸림 — 코드 한 줄 던지면서 맥락 안 줌" >> ~/think-prompt-dogfood.md
```

이 메모는 **공유 안 함** (D-004 로컬 중심). 1주일 후 회고에만 사용.

---

## 주중 (수요일쯤) — 1차 점검

```bash
# 본인 머신의 think-prompt 통계 한 번 출력
think-prompt list --limit 20
think-prompt list --tier bad --limit 10
sqlite3 ~/.think-prompt/prompts.db "
  SELECT COUNT(*) AS total,
         AVG(rule_score) AS avg,
         SUM(rule_score < 60) AS bad_count
  FROM prompt_usages WHERE created_at > datetime('now','-3 days');
"
```

**판정 기준 (개인적, 외부 공유 안 함):**
- 사흘간 프롬프트 50개 이상이면 의미있는 데이터. 미만이면 대시보드 회고 가치 ↓
- avg score 가 _일정한지 vs 좋아지는지_ — 자각 효과의 약한 증거
- bad 가 줄어들면 _본인이 학습 중_ , 안 줄면 _자각만 있고 행동 변화 없음_

---

## 1주일 후 (회고) — #10 에 코멘트로 남길 것

[`#10`](https://github.com/must-goldenrod/think-prompt/issues/10) 에 다음 형식으로:

```markdown
## Maintainer dogfood log — @<github-id> · week 1

**Period:** 2026-MM-DD → 2026-MM-DD
**Total prompts logged:** N
**Avg score:** XX.X
**Most-hit rule:** R0XX (occurred N times)

### Mission signals
- [ ] Dashboard created at least one moment of real self-awareness ("아 이거 또 그랬네")
- [ ] Found a pattern in my own prompts I didn't know about
- [ ] Doctor caught a real failure (or surfaced none — confirm green)
- [ ] Empty-state UX before first prompt — friendly enough?

### Bugs / friction
- (list any concrete failure with reproduction)

### Tier threshold feedback (#7)
- "good" tier prompts that felt too generous: N out of M
- "bad" tier prompts that felt fair: N out of M

### Next-iteration ask
- (one concrete UX improvement that would make this 10× more valuable)
```

이 데이터가 **#7 (tier threshold tuning)** 와 **D-035 후보 결정** 의 evidence 가 된다.

---

## 자동 모니터링 (별개)

릴리스 측면 통계 (npm 다운로드 + GitHub 활동) 는 dogfooding 과 별도로:

```bash
scripts/release-monitor.sh                     # 한 번 dump
scripts/release-monitor.sh --since 7d          # 지난 7일
scripts/release-monitor.sh --markdown          # GitHub 코멘트용
```

GitHub Actions 가 매주 월요일 오전 9시 KST 자동 실행 → [#10](https://github.com/must-goldenrod/think-prompt/issues/10) 에 코멘트 추가 (`.github/workflows/weekly-monitor.yml`).

---

## 끝낼 조건

다음 셋 중 둘 이상 충족하면 dogfooding 1주차 종료:

1. 메인테이너 1명 이상이 위 회고를 #10 에 작성
2. v0.1.1 패치 우선순위가 정해짐 (#7 thresholds 또는 새 이슈)
3. "이 대시보드 매일 안 열게 됐다" 라는 솔직한 회고가 나옴 — _이건 실패 신호_, 미션 재검토 필요

세번째가 나오면 D-032 의 미션 정렬 자체를 다시 본다 — 자각 표면이 dashboard 외에 _주간 브리프_, _CLI 알림_ 같은 push 기반이 필요할 수 있음.
