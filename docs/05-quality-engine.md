# 05 · 품질 엔진 (룰셋 · 스코어 · LLM 심판 · 리라이터)

> 이 문서 하나로 품질 평가 로직 전부 구현 가능하도록.
> **D-046** (D-006 supersede): 품질 평가는 단일 숫자가 아니라 `{score, top_issue, confidence, delta}` **4-tuple 계약**. 비대칭 cap floor · positive bonus · efficiency 축 · 개인 baseline delta · confidence signaling 의 다섯 축으로 구성.

---

## 1. 룰 엔진 아키텍처

### 1.1 룰 인터페이스
```ts
// packages/rules/src/types.ts
export interface Rule {
  id: string;                      // "R001"
  name: string;                    // "too_short"
  category: 'structure' | 'context' | 'output' | 'safety' | 'style';
  description: string;
  severity: 1 | 2 | 3 | 4 | 5;     // 1=info, 5=critical
  detect: (input: DetectInput) => DetectOutput | null;
}

export interface DetectInput {
  promptText: string;
  session: { cwd: string; model?: string };
  meta: { charLen: number; wordCount: number };
}

export interface DetectOutput {
  severity: 1 | 2 | 3 | 4 | 5;     // 룰 기본값 override 가능
  message: string;                 // 유저에게 보일 메시지
  evidence?: string;               // 매칭된 스니펫
  fixHint?: string;                // 자동 수정 힌트 (리라이터에 전달)
}
```

### 1.2 실행 모델
- 모든 룰을 순회, `detect`가 non-null 반환 시 `rule_hits`에 저장.
- 룰은 **순수 함수** · **사이드이펙트 없음** · **< 10 ms**.
- 외부 호출(LLM) 금지 — 그건 심판의 역할.
- 룰 업데이트 시 `rules_version` 증가 → 기존 스코어는 재계산 큐에 넣음.

---

## 2. 룰셋 v0.1.1

**14개.** 각 룰은 독립적으로 on/off 가능.

| ID | 이름 | 카테고리 | 기본 severity | 트리거 | 메시지 |
|---|---|---|---|---|---|
| R001 | too_short | structure | 2 | `word_count < 4` | "프롬프트가 너무 짧습니다. 목적·대상·기대 결과를 한 줄 더 추가해 보세요." |
| R002 | no_output_format | output | 3 | 출력 형식 힌트 키워드 없음("json/표/bullet/요약/…") | "출력 형식이 지정되지 않았습니다. JSON/bullet/길이 등을 명시하면 결과가 일관됩니다." |
| R003 | no_context | context | 3 | 맥락 키워드 없음(한/영/일/중 다국어) + `word_count < 30` | "대상 도메인·프로젝트 맥락이 빠졌습니다." |
| R004 | multiple_tasks | structure | 3 | 접속사 "and/그리고/또한" ≥ 3회 **또는** `//`·`/` 구분자 ≥ 2회 + 명령형 동사 ≥ 2회 | "여러 태스크가 섞여 있습니다. 하나씩 나누면 결과 품질이 올라갑니다." |
| R005 | injection_attempt | safety | 5 | `/ignore (all )?previous/i`, `system:` 블록 위조, `<\|im_start\|>` 등 | "프롬프트 인젝션 패턴이 감지됐습니다." |
| R006 | no_success_criteria | output | 2 | 완료 조건/검수 기준 표현 없음 | "무엇이 '좋은 결과'인지 기준이 없습니다." |
| R007 | ambiguous_pronoun | structure | 2 | "이거/그거/위 내용" 등 대명사로 시작 + 앞 턴 짧음 | "대명사 지칭이 모호합니다." |
| R008 | no_examples_when_complex | style | 1 | `word_count > 80` 이면서 "예:/example:" 없음 | "복잡한 요청이면 예시를 1개 포함하는 편이 좋습니다." |
| R009 | imperative_missing | structure | 2 | 명령형 동사·요청 표현 없음 | "무엇을 해달라는지 명확한 동사가 없습니다." |
| R010 | no_constraint | output | 2 | 길이/시간/언어/포맷 제약 없음 | "출력 제약(길이/언어/범위)이 없습니다." |
| R011 | question_without_context | context | 2 | 단순 질문형 + `word_count < 15` | "배경 없이 단문 질문입니다." |
| R012 | code_dump_no_instruction | structure | 3 | 코드블록이 본문의 **65% 이상** + 지시어 없음 | "코드만 붙여넣으셨습니다." |
| R013 | pii_detected | safety | 1–3 | `meta.piiHits` 비어 있지 않음 (카테고리 수에 따라 severity 1/2/3) | "프롬프트에 민감정보(…)가 포함돼 있습니다." |
| R014 | vague_adverb | style | 2 | `좀/대충/그냥/kinda/probably` 등 모호 부사 | "모호한 부사가 있습니다. 구체적 기준으로 바꾸세요." |

### 2.1 검출 로직 상세

```ts
// packages/rules/src/r001.ts
export const r001: Rule = {
  id: 'R001',
  name: 'too_short',
  category: 'structure',
  description: '단어 수가 극히 적어 의도 파악이 어려움',
  severity: 2,
  detect: ({ meta }) => {
    if (meta.wordCount >= 4) return null;
    return {
      severity: 2,
      message: '프롬프트가 너무 짧습니다. 목적·대상·기대 결과를 한 줄 더 추가해 보세요.',
      fixHint: 'expand_intent'
    };
  }
};
```

**출력 형식 감지(R002)** — 한국어/영어 혼용 허용.
```ts
const FORMAT_KEYWORDS = [
  /\bjson\b/i, /\byaml\b/i, /\bcsv\b/i, /\btable\b/i, /\bmarkdown\b/i,
  /\bbullet(s)?\b/i, /표\s*로/u, /리스트\s*로/u, /단계별/u, /단락/u,
  /\b(ten|five|three|\d+)\s+(words|sentences|lines|bullets)\b/i,
  /(\d+)\s*(자|문장|문단|줄)\s*(이내|이하|로|까지)?/u
];
```

비슷하게 각 룰은 한/영 키워드 세트로 감지. 전체 목록은 `packages/rules/src/keywords.ts`.

---

## 3. 품질 스코어 공식 (D-046)

### 3.1 정의 — 4-tuple 계약

점수는 항상 네 개 값을 묶어서 제공된다:

```ts
interface ScoreOutcome {
  score:      number;                         // 0..100
  tier:       'good' | 'ok' | 'weak' | 'bad';
  confidence: 'high' | 'medium' | 'low';
  delta?:     number;                         // baseline 대비 ± (데이터 쌓인 뒤)
  top_issue?: string;                         // 한 줄 진단
}
```

최종 점수는 아래 순서로 계산된다:

```
raw_score   = compose(rule_score, usage_score, judge_score)     (§3.4)
bonus       = positiveBonus(signals)                            (§3.3, 최대 +10)
capped      = applyCap(raw_score + bonus, severity_max_hit)     (§3.5)
final_score = round(capped)
delta       = final_score - user_baseline_snapshot.avg          (Phase 3, §5)
confidence  = computeConfidence(hits, usage, judge, context)    (§6)
```

### 3.2 `rule_score` 계산 (감점 축)

```
rule_score_raw = max(0, 100 - Σ(severity_weight))
```

**severity_weight (D-046 반영, 룰 재조정 이후):**
| severity | weight | 해당 룰 |
|---|---|---|
| 1 | 2 | R001·R008·R010·R011·R013(경미)·R018 |
| 2 | 5 | R006·R007·R009·R013(중간)·R014·R015·R016·R017 |
| 3 | 10 | R002·R003·R013(심각) |
| 4 | 18 | R004·R012 |
| 5 | 30 | R005 |

### 3.3 Positive signal bonus (가점 축, D-046 신규)

"있으면 좋은 것" 이 있을 때 `rule_score` 위에 최대 **+10 까지** 합산. 감점과 독립적으로 계산되며, 한 번 더해지면 `min(100, rule_score + bonus)` 로 cap.

| signal | +점수 | 판정 |
|---|---|---|
| 출력 포맷 명시 | +3 | `FORMAT_KEYWORDS` 매칭 |
| 성공 기준 제시 | +3 | `SUCCESS_CRITERIA_KEYWORDS` 매칭 |
| 예시 포함 | +2 | `EXAMPLE_KEYWORDS` 매칭 (단, wordCount ≥ 40일 때) |
| 파일 경로 / 버전 명시 | +2 | `FILE_PATH_PATTERNS` 또는 `VERSION_PATTERNS` 매칭 |

합 `≤ 10`. 감점 0 + bonus 10 이면 `rule_score` 가 `100` 에 쉽게 도달.

### 3.4 `usage_score` 계산 (D-046 efficiency 축 추가)

```
usage_score = 0.25*failScore + 0.20*reuseScore + 0.10*lengthScore
            + 0.25*feedbackScore + 0.20*efficiencyScore
```

| 지표 | 계산 | 가중치 |
|---|---|---|
| 도구 실패율 | `(1 - fail/calls) * 100` | **0.25** (기존 0.35) |
| 재시도 비율 역수 | `(1 - min(1, reuse/5)) * 100` | **0.20** (기존 0.25) |
| 응답 길이 적합성 | 범위 내 100 / 밖에서 편차 감점 | **0.10** (기존 0.15) |
| 유저 피드백 | `ups/(ups+downs) * 100` | 0.25 (유지) |
| **Efficiency (신규)** | §3.4.1 | **0.20** |

피드백/efficiency 모두 없으면 해당 항 가중치 제외하고 재정규화.

#### 3.4.1 Efficiency 계산
Tier 2 worker 가 transcript JSONL 파싱 시 추출:
- **first_shot_success** (0 또는 1): 다음 턴의 프롬프트가 correction 패턴 (`/다시|아니|취소|재시도|redo|no wait/i`) 이면 0, 아니면 1. 마지막 턴은 1.
- **tool_call_count**: 이 턴 동안 발생한 `tool_use` 이벤트 수.
- **follow_up_depth**: 같은 의도의 연속 턴 수 (1 이 이상적).

```
efficiencyScore = clamp(0, 100,
    firstShotSuccess * 60
  + toolEconomyScore(tool_call_count) * 30
  + followUpScore(follow_up_depth) * 10
)
```
- `toolEconomyScore`: 0 calls → 100, 1~3 → 90, 4~8 → 75, 9~15 → 50, >15 → 25
- `followUpScore`: 1 → 100, 2 → 70, 3 → 40, ≥4 → 20

### 3.5 비대칭 cap floor (D-046 핵심)

심각 룰 히트 시 상한선 강제. 다른 항목이 100 이어도 덮지 못함.

```
max_severity = max(severity in rule_hits, 0)
severity3_count = count(hits where severity == 3)

if max_severity >= 5:  cap = 40   // bad
elif max_severity >= 4: cap = 60  // weak 이하
elif severity3_count >= 2: cap = 75
else: cap = 100

final_score = min(raw_score + bonus, cap)
```

**왜 cap 인가:** severity weight 단순 감점으로는 severity 5 하나 + 다른 모든 요소 완벽 시 `30 점만 감점 → 70` 이 나와 "문제 있는 프롬프트" 가 `ok` tier 로 노출되는 모순. cap 은 이를 구조적으로 차단.

### 3.6 Tier 매핑 (D-046 밴드 상향)

| final_score | tier | 대시보드 색 | 의미 |
|---|---|---|---|
| 90–100 | good | 초록 | 감점 없음 + positive bonus. 자신감. |
| 70–89 | ok | 노랑 | 경미한 개선 여지. |
| 50–69 | weak | 주황 | 구조적 문제 또는 severity 3 히트. |
| 0–49 | bad | 빨강 | severity 4+ 히트 또는 누적 감점 과다. |

(기존: 85/65/45. good 진입 조건 강화 → positive bonus 없이는 진입 불가.)

---

## 4. LLM 심판 (Meta-Judge)

### 4.1 Trigger (D-046 변경)
- 기본값: **`confidence == 'low'`** (§6 참조) OR R005(인젝션) 의심. (기존 `rule_score < 60` 대체.)
- low confidence 케이스만 잡으면 대부분의 명확한 점수는 judge 안 부르고 지나감 → 비용 자연 감소.
- 한 프롬프트 해시당 **1회만** 호출(캐시). 룰 버전 바뀌면 재호출.
- `llm.enabled=false`면 전부 건너뜀.

### 4.2 시스템 프롬프트 (캐시 대상)
```
You are a precise prompt-quality auditor for developer workflows with Claude Code.
Given a user-typed prompt, score its quality from 0 to 100 across these axes:
- Clarity of intent (25)
- Sufficient context (25)
- Output format specification (20)
- Single focused task (15)
- Success criteria (15)

Return STRICT JSON:
{"score": <0-100>, "axes": {...}, "top_issue": "<one sentence>", "fix_hint": "<one actionable sentence>"}

No prose outside JSON. No markdown. No code fences.
```

### 4.3 유저 메시지 템플릿
```
[PROMPT]
<프롬프트 원문 또는 마스킹본>
[CONTEXT]
cwd: <cwd>
model: <model>
char_len: <len>
[END]
```

### 4.4 결과 처리
- JSON 파싱 실패 시 재시도 1회. 여전히 실패면 judge_score=NULL, audit에 기록.
- `judge_score`가 저장되면 final_score 재계산:
  ```
  final_score = round(0.5*rule_score + 0.3*usage_score + 0.2*judge_score)
  (usage_score 없으면 0.6 / 0.4 로)
  ```

---

## 5. 자동 리라이터 (Rewriter)

### 5.1 Trigger
- 유저가 대시보드에서 "개선안 보기" 클릭 OR CLI `think-prompt rewrite <usage_id>`.
- 기본은 수동(자동 실행은 토큰 낭비).

### 5.2 시스템 프롬프트 (캐시)
```
You rewrite developer prompts to maximize clarity and reliability for Claude Code.
Follow this structure in the improved version:
1) Goal — one sentence
2) Context — what project/domain/constraints
3) Task — the single concrete ask
4) Output format — explicit (JSON schema / bullets / length)
5) Success criteria — how to know it worked
6) Optional: 1 short example

Rules:
- Preserve the user's original intent exactly.
- Do NOT add fabricated facts or hidden constraints.
- Keep Korean→Korean, English→English unless user mixed them.

Return STRICT JSON:
{
  "after_text": "<the improved prompt>",
  "reason": "<2-3 sentences on what changed and why>",
  "applied_fixes": ["<rule_id>", ...]
}
```

### 5.3 유저 메시지
```
[ORIGINAL PROMPT]
<원문>

[DETECTED ISSUES]
- R001: too_short (severity 2)
- R003: no_context (severity 3)
...
[END]
```

### 5.4 저장
- `rewrites` 테이블에 status=`proposed`.
- 유저가 accept → status=`accepted` + (선택) 클립보드 복사.
- 유저가 reject → status=`rejected` + 피드백 텍스트 옵션.

---

## 6. 비용 관리

| 항목 | 전략 |
|---|---|
| 시스템 프롬프트 캐시 | `cache_control: { type: 'ephemeral' }` (5분 TTL) |
| 중복 호출 방지 | `prompt_hash`당 심판 1회, 리라이트 1회 |
| 월 한도 | `llm.max_monthly_tokens` 초과 시 LLM 기능 자동 OFF + 경고 |
| 모델 선택 | 심판 = Haiku, 리라이트 = Haiku (고품질 필요 시 Sonnet으로 토글) |
| 배치 | 심판은 세션 종료 60초 배치로 묶어 호출 |

---

## 7. 룰 버저닝
- 룰셋 전체 해시 = `rules_version`.
- 스코어 행은 `rules_version` 포함 저장.
- 룰셋 업데이트 릴리스 시 `think-prompt reprocess --all` CLI로 재채점 가능.

---

## 5. 개인 Baseline (D-046 Phase 3)

### 5.1 계산 윈도우
- **누적 턴 ≥ 50** 인 유저부터 활성화. 미만은 `delta = null` + UI `calibrating…` 라벨.
- Rolling window: **최근 30일** 의 `quality_scores` 행.
- 저장: `user_baseline_snapshots(scope, window_days, computed_at, avg_final_score, avg_word_count, sample_size, snapshot_json)`. 하루 1회 갱신 (worker 배치).

### 5.2 Delta 계산
```
delta = final_score - snapshot.avg_final_score
```
- 유저 디테일 페이지: 절대 점수 옆에 `(당신 평균 78 대비 -6)` 형태.
- 리스트: tier 배지 아래 `Δ-6` 같은 micro 표시.

### 5.3 왜 개인 baseline 인가
- 환경 변수(뉘앙스·맥락·기분·대화 이력) 는 **유저 자신의 평균과 비교** 할 때 자연스럽게 정규화됨.
- "그날따라 짧게 쓴 프롬프트" 가 평균 대비 낮으면 유저도 납득. 다른 유저 평균과는 비교 안 함(D-004 로컬 원칙).

---

## 6. Confidence Signaling (D-046 Phase 4)

### 6.1 판정
```ts
function computeConfidence(input): 'high' | 'medium' | 'low' {
  const { max_severity, has_usage, has_judge, context_unusual, baseline_delta } = input;

  // Low: 시스템이 자기 한계를 인정해야 하는 경우
  if (context_unusual) return 'low';                  // 첫 턴, correction 직후, 매우 긴 세션 말미 등
  if (baseline_delta != null && Math.abs(baseline_delta) > 25) return 'low';
  if (max_severity <= 1 && !has_usage && !has_judge) return 'low'; // 신호 부족

  // High: 명확한 판정
  if (max_severity >= 3 && (has_usage || has_judge)) return 'high';
  if (max_severity === 0 && has_usage) return 'high';

  return 'medium';
}
```

### 6.2 UI 표현
- `high`: 점수 옆 작은 "●" (채워진 도트)
- `medium`: "○" (빈 도트)
- `low`: "○ 참고용" (한 줄 설명)

### 6.3 왜 확신도를 노출하는가
- **신뢰 계약.** 시스템이 자기 한계를 인정하면 유저가 점수에 대들지 않는다. 오히려 high-confidence 점수는 유저도 수용.
- **LLM judge 트리거가 여기로 수렴.** `confidence == 'low'` 만 judge 를 호출 → 비용·프라이버시 자연 통제.

---

## 8. 콜드스타트 정책

- **턴 수 < 50**: confidence 는 기본 `medium`, delta 비활성, UI 상단 `calibrating… (N/50)` 배너.
- **턴 수 < 10**: Tier 밴드만 표시, 퍼센트 점수 숨김. "아직 당신 패턴을 배우는 중입니다" 문구.
- 이 상태는 D-004(로컬 중심) · D-028(fail-open) 과 정합 — 데이터가 부족하면 과도한 단언을 하지 않는다.
