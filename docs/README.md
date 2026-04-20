# docs/ · 설계 & 기획 문서 인덱스

> Think-Prompt — Claude Code 프롬프트 수집·코칭 서비스.

### 👉 처음이면 먼저 읽으세요
- **[GUIDE.md](./GUIDE.md)** — 초보자용 완전 입문 가이드 (설치부터 고급 기능까지)

### 설계 문서

> **읽는 순서는 번호순.** 각 문서가 앞 문서의 결정을 전제한다.

| # | 문서 | 역할 |
|---|---|---|
| 00 | [decision-log.md](./00-decision-log.md) | 모든 결정의 역사·근거 (D-001…). 문제가 생기면 여기부터. |
| 01 | [hook-design.md](./01-hook-design.md) | Claude Code 훅 선택·아키텍처·fail-open 원칙 |
| 02 | [tech-stack.md](./02-tech-stack.md) | 런타임·프레임워크·툴링 확정 |
| 03 | [local-storage.md](./03-local-storage.md) | SQLite 스키마·디렉토리·데몬 수명주기 |
| 04 | [transcript-parser.md](./04-transcript-parser.md) | 훅이 못 잡는 데이터를 JSONL에서 복원 |
| 05 | [quality-engine.md](./05-quality-engine.md) | 룰셋 v0 · 스코어 공식 · LLM 심판 · 리라이터 |
| 06 | [coaching-ux.md](./06-coaching-ux.md) | 대시보드 · 인라인 코칭 · CLI |
| 07 | [build-and-test-plan.md](./07-build-and-test-plan.md) | **M-1 → M9 마일스톤 + 유저 테스트 절차** |
| 08 | [quality-criteria.md](./08-quality-criteria.md) | **62개 품질 기준 분류 · 검증 방법론** (living doc) |
| 99 | [observation-log.md](./99-observation-log.md) | 실측·관찰 기록 (M0에서 주로 채움) |
| — | [proposal-draft.md](./proposal-draft.md) | 초기 제안서 (문맥 · 비교 · 확정 전 초안) |
| — | [conversation-log.md](./conversation-log.md) | 주요 대화·논의의 맥락 기록 |

---

## 읽기 지침

- **처음 오는 사람:** `00` → `07` → 필요한 것만 깊게.
- **코딩 들어가는 사람:** `02` → `03` → `07`의 해당 마일스톤 → 필요 시 `04`/`05`/`06`.
- **문제 터졌을 때:** `00`에서 관련 결정 확인 → `99`에서 실측 확인 → 해당 스펙 문서.
- **스펙 변경:** `00`에 새 D-번호로 추가. 기존 번호 취소는 취소선 + 새 번호로 supersede.

---

## 주요 확정 사항 요약

- **타겟:** 개인 개발자 · 무료 (D-001)
- **포지션:** 수집 + 개선 둘 다 (D-002)
- **MVP 채널:** Claude Code 훅 단독 (D-003)
- **저장:** 로컬 중심, 원문은 PC 밖 안 나감 (D-004, D-030)
- **품질:** 룰 70% + 실사용 30%, LLM 심판은 의심 케이스만 (D-006)
- **스택:** Node 20 LTS + TypeScript + pnpm monorepo, Fastify + better-sqlite3, Anthropic SDK (Haiku) (D-008…D-015)
- **배포:** npm global, MIT, macOS+Linux (D-022, D-023, D-024)
- **원칙:** Fail-open — 우리 때문에 Claude Code가 막히지 않는다 (D-028)
