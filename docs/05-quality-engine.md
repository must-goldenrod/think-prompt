# 05 · 품질 엔진 (룰셋 · 스코어 · LLM 심판 · 리라이터)

> 이 문서 하나로 품질 평가 로직 전부 구현 가능하도록.
> D-006: 룰 70% + 실사용 30%. LLM 심판은 `final_score < 60` 케이스에만 trigger.

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

## 2. 룰셋 v0 (MVP)

**12개로 시작.** 각 룰은 독립적으로 on/off 가능.

| ID | 이름 | 카테고리 | 기본 severity | 트리거 | 메시지 |
|---|---|---|---|---|---|
| R001 | too_short | structure | 2 | `word_count < 4` | "프롬프트가 너무 짧습니다. 목적·대상·기대 결과를 한 줄 더 추가해 보세요." |
| R002 | no_output_format | output | 3 | 출력 형식 힌트 키워드 없음("json/표/bullet/요약/…") | "출력 형식이 지정되지 않았습니다. JSON/bullet/길이 등을 명시하면 결과가 일관됩니다." |
| R003 | no_context | context | 3 | 맥락 키워드 없음("이 프로젝트는/사용자는/도메인은…") + `word_count < 30` | "대상 도메인·프로젝트 맥락이 빠졌습니다." |
| R004 | multiple_tasks | structure | 3 | 접속사 "and/그리고/또한"으로 연결된 동사 ≥ 3 | "여러 태스크가 섞여 있습니다. 하나씩 나누면 결과 품질이 올라갑니다." |
| R005 | injection_attempt | safety | 5 | `/ignore (all )?previous/i`, `system:` 블록 위조 시도, `<\|im_start\|>` 등 | "프롬프트 인젝션 패턴이 감지됐습니다." |
| R006 | no_success_criteria | output | 2 | 완료 조건/검수 기준 표현 없음 | "무엇이 '좋은 결과'인지 기준이 없습니다. '성공 기준' 한 줄을 추가하세요." |
| R007 | ambiguous_pronoun | structure | 2 | "이거/그거/위 내용" 등 대명사로 시작 + 앞 턴 짧음 | "대명사 지칭이 모호합니다. 무엇을 가리키는지 명시하세요." |
| R008 | no_examples_when_complex | style | 1 | `word_count > 80` 이면서 "예:/example:" 없음 | "복잡한 요청이면 예시를 1개 포함하는 편이 좋습니다." |
| R009 | imperative_missing | structure | 2 | 명령형 동사·요청 표현 없음 | "무엇을 해달라는지 명확한 동사가 없습니다." |
| R010 | no_constraint | output | 2 | 길이/시간/언어/포맷 제약 없음 | "출력 제약(길이/언어/범위)이 없습니다." |
| R011 | question_without_context | context | 2 | 단순 질문형 + `word_count < 15` | "배경 없이 단문 질문입니다. 이전에 무엇을 했는지 1줄 덧붙이면 좋습니다." |
| R012 | code_dump_no_instruction | structure | 3 | 코드블록이 본문의 80% 이상이면서 지시어 없음 | "코드만 붙여넣으셨습니다. 원하는 동작(디버그/리뷰/설명)을 지시어로 추가하세요." |

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

## 3. 품질 스코어 공식

### 3.1 정의
```
final_score = round(
  0.7 * rule_score
  + 0.3 * usage_score
)
```
- **`rule_score`**: 룰베이스 결정론 (필수)
- **`usage_score`**: 실사용 메트릭 (없으면 스킵하고 rule_score만)

### 3.2 `rule_score` 계산
```
rule_score = max(0, 100 - Σ(severity_weight))
```
severity_weight:
| severity | weight |
|---|---|
| 1 | 2 |
| 2 | 5 |
| 3 | 10 |
| 4 | 18 |
| 5 | 30 |

### 3.3 `usage_score` 계산
다음 지표의 가중 평균(세션 종료 후 계산). 데이터 없으면 NULL.
| 지표 | 계산 | 가중치 |
|---|---|---|
| 도구 실패율 | `1 - fail/calls` | 0.35 |
| 재시도 비율 역수 | 같은 유사 프롬프트 반복 수 → 낮을수록 좋음 | 0.25 |
| 응답 길이 적합성 | 요청 범위 대비 출력 길이 편차 | 0.15 |
| 유저 피드백 | 👍/👎 명시(M6 이후) | 0.25 |

MVP에선 상위 3개만 쓰고 피드백은 M6에서 추가.

### 3.4 Tier 매핑
| final_score | tier | 대시보드 색 |
|---|---|---|
| 85–100 | good | 초록 |
| 65–84 | ok | 노랑 |
| 45–64 | weak | 주황 |
| 0–44 | bad | 빨강 |

---

## 4. LLM 심판 (Meta-Judge)

### 4.1 Trigger
- 기본값: `rule_score < 60` OR `final_score < 60` (usage 있을 때) OR R005(인젝션) 의심.
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
