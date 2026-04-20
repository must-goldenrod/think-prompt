# docs/corpora/

프롬프트 품질 평가 **검증 코퍼스(labelled corpus)**. 각 JSON/JSONL 파일은 아래 스키마로 작성된다.

## 파일 포맷 (JSON Lines)

한 줄에 한 샘플. 각 라인은 다음 필드를 갖는다.

```json
{
  "id": "COR-001",
  "prompt": "fix",
  "labels": {
    "C-001": true,
    "C-016": true
  },
  "rule_hits_expected": ["R001", "R002", "R003", "R009"],
  "language": "en",
  "source": "dogfood-2026-04-20",
  "quality": "bad",
  "notes": "one-word ask"
}
```

### 필드 설명

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | `COR-NNN` | 영구 ID. 중복 금지. |
| `prompt` | string | 원문 프롬프트 (PII 제거 또는 마스킹 완료된 형태). |
| `labels` | `{ "C-NNN": boolean }` | 각 criterion에 대한 사람의 라벨 (true = 해당됨). |
| `rule_hits_expected` | `string[]` | 이 프롬프트에 fire **되어야** 한다고 기대하는 룰 ID. |
| `language` | ISO 639-1 | 프롬프트 언어 (`en`, `ko`, `ja`, `zh`, `mixed`). |
| `source` | string | 수집 출처 (`dogfood-YYYY-MM-DD` · `synthetic-edge-case` · `community-submission` 등). |
| `quality` | `good` / `ok` / `weak` / `bad` | 작성자의 주관적 tier 판정. 참고용. |
| `notes` | string | 라벨링 이유, 주의사항 등. |

## 용도

1. **Regression test.** 룰 변경 시 `rule_hits_expected` 와 실제 실행 결과 diff.
2. **Precision/Recall 측정.** `labels` 의 true/false 와 룰 발동 여부 매칭.
3. **문서 예시 생성.** `docs/08-quality-criteria.md` 의 "좋은/나쁜 예" 업데이트.

## 현재 파일

- [`v0.1.2-seed.jsonl`](./v0.1.2-seed.jsonl) — 20개 seed (10 ko · 5 en · 2 ja · 2 zh · 1 mixed)

## 기여 방법

1. `v0.1.2-seed.jsonl` 같은 기존 파일에 append, 또는 새 파일(`corpus-topic.jsonl`) 추가.
2. `npm run corpus:validate` 로 스키마 검증 (향후 script 예정).
3. 커밋 메시지: `corpus(v0.1.x): add N samples from <source>`.

## 프라이버시 원칙

- **실제 개인 프롬프트를 그대로 넣지 않는다.** PII 마스킹은 기본이며, 어떤 민감 내용이 있었다면 합성 프롬프트로 치환.
- 코퍼스는 공개 리포의 일부이므로 본인이 공유 가능한 내용만.
