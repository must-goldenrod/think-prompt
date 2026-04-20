# 08 · 프롬프트 품질 평가 기준 (Quality Criteria Framework)

> **Living document.** 품질을 판단하는 모든 차원(dimension)을 체계화하고, 각 차원을 어떻게 감지·점수화할지, 그리고 **어떻게 검증할지** 를 다룬다.
> 목적: 현재 12개 룰(R001~R012)의 커버리지 구멍을 메꾸고, 장기적으로 다각화된 평가 체계를 구축.

---

## 📌 이 문서의 성격

| 항목 | 값 |
|---|---|
| 문서 타입 | Living / Versioned |
| 업데이트 주기 | 월 1회 검증 + 신규 이슈 발생 시 수시 |
| 검증 소유자 | 유지보수자 + 커뮤니티 피드백 |
| 기반 문서 | [`05-quality-engine.md`](./05-quality-engine.md) (구현), [`00-decision-log.md`](./00-decision-log.md) (D-006 스코어 공식) |
| 종결 조건 | v1.0에서 **≥ 40개 검증된 criterion** 보유 시 |

### 각 기준(criterion)의 메타 필드
| 필드 | 의미 | 값 |
|---|---|---|
| `id` | `C-NNN` 형식 | 영구, 취소 시 tombstone |
| `status` | 현재 상태 | `hypothesis` / `prototyped` / `validated` / `discarded` |
| `confidence` | 품질 영향 확신도 | `low` / `medium` / `high` (근거 수준) |
| `detection` | 감지 방법 | `rule` / `llm` / `user-feedback` / `composite` |
| `rule-id` | 구현된 룰 (있다면) | `R001` 등 |
| `last-verified` | 마지막 검증일 | ISO date |

---

## 1. 왜 이 문서가 필요한가

### 1.1 현재 상태 (2026-04-20 기준)

- **구현된 룰:** 12개 (R001~R012)
- **커버 중인 차원:** structure(5) · context(2) · output(3) · safety(1) · style(1)
- **놓치고 있는 것 (대표):**
  - `//` 같은 비전통 구분자로 여러 태스크 섞기 → R004 감지 못함
  - 욕설·비속어
  - 오타·맞춤법 오류
  - 한·영 혼용 적절성
  - 대화 연속성 (이전 턴 참조 모호)
  - 비영어·비한국어 (일본어·중국어 등)
  - 지시 동사의 "구체성 수준" (두루뭉술 vs 명확)
  - 예시 품질 (예시가 있긴 한데 prompt와 mismatch)
  - 환경/버전 명시 부족
  - **그 외 다수**

### 1.2 왜 룰만으로 부족한가

| 차원 유형 | 예시 | 룰로 가능? |
|---|---|---|
| 형태 | 단어 수 · 정규식 · 키워드 존재 | ✅ 결정론 |
| 구조 | 섹션 순서 · 문단 구성 | ⚠️ 부분 |
| 의도 적합성 | "이 프롬프트가 충분히 구체적인가?" | ❌ 맥락 판단 필요 → LLM |
| 결과 품질 | 실제 Claude가 얼마나 잘 답했나 | ❌ usage_score 또는 피드백 |
| 도메인 정확성 | 코드 오류 진단에서 맞는 에러 타입을 언급했나 | ❌ 도메인 지식 필요 |

→ **룰 + LLM 심판 + 실사용 메트릭 + 유저 피드백** 4축 혼합이 필수.

---

## 2. 평가 차원 분류(Taxonomy)

**12개 대분류 · 약 60개 criterion.** 번호는 안정(변경 시 tombstone).

| 대분류 | 약어 | 포함 criterion 수 |
|---|---|---|
| §2.1 구조 (Structure) | STR | 8 |
| §2.2 맥락 (Context) | CTX | 7 |
| §2.3 출력 정의 (Output Spec) | OUT | 6 |
| §2.4 명확성 (Clarity) | CLR | 6 |
| §2.5 언어·문체 (Language) | LNG | 7 |
| §2.6 안전·윤리 (Safety) | SAF | 5 |
| §2.7 도구 활용 (Tool-use) | TUL | 4 |
| §2.8 대화 연속성 (Conversation) | CNV | 4 |
| §2.9 다국어·혼용 (Multilingual) | MLG | 4 |
| §2.10 코드 특화 (Code) | COD | 4 |
| §2.11 모델 특화 (Model) | MDL | 3 |
| §2.12 포맷팅 (Formatting) | FMT | 4 |

**총 62개 criterion.** 아래 §3~§14에서 각각 상세화.

---

## 3. STR — 구조 (Structure)

### C-001 · 단어 수: 과도하게 짧음
- **Status:** validated · **Confidence:** high · **Rule:** R001
- **정의:** word_count < 4 일 때 의도 추정이 구조적으로 불가.
- **근거:** 모델은 다음 토큰 예측이라 맥락 부족 시 편향 추정.
- **좋은 예:** 15단어짜리 명시적 요청
- **나쁜 예:** `fix`, `help`, `?`
- **언어 특수성:** 한국어는 조사 분리로 인해 실제 단어 수가 영어보다 적게 세어질 수 있음 → threshold 조정 고려
- **개선 제안:** 한국어 문서는 형태소 수 기준으로 변경 시 더 정확

### C-002 · 단어 수: 과도하게 긴데 예시 없음
- **Status:** validated · **Confidence:** medium · **Rule:** R008 (sev 1)
- **정의:** word_count > 80 + 예시 키워드 없음
- **토론:** 긴 프롬프트는 본질적으로 나쁘지 않음. "긴데 산만"이 문제.
- **개선 제안:** **길이 * 엔트로피** 복합 지표로 전환 (C-003에서 다룸)

### C-003 · 산만함 (Rambling) — *미구현*
- **Status:** hypothesis · **Confidence:** medium · **Rule:** (none)
- **정의:** 긴 프롬프트인데 핵심 요청이 여러 번 바뀌거나 재서술됨
- **감지 방법 후보:**
  - LLM 심판에게 "이 프롬프트의 주제가 몇 번 바뀌나?" 물어봄
  - 또는 문장별 임베딩의 variance 측정
- **검증 필요:** 대조군 프롬프트 수집 필요

### C-004 · 단일 태스크 vs 다중 태스크
- **Status:** prototyped · **Confidence:** high · **Rule:** R004
- **정의:** 하나의 프롬프트에 복수 독립 작업
- **현재 감지:** `and` / `그리고` / `또한` 3회 이상
- **놓치는 패턴 (→ 확장 제안):**
  - `//` · `,` · `/` 같은 비전통 구분자
  - 불릿 리스트로 태스크 나열
  - 개행으로 분리된 명령형 문장들
- **확장 제안 → R004v2:** 문장 분리 후 각 문장의 명령형 동사 카운트
- **검증:** 100개 실데이터로 false positive/negative 측정 필요

### C-005 · 섹션 순서 (권장 순서) — *미구현*
- **Status:** hypothesis · **Confidence:** low
- **정의:** 효과적 프롬프트는 [Goal → Context → Task → Constraints → Output → Examples] 순.
- **감지 방법:** 각 섹션의 표식어(예: "목표:", "맥락:", "## Task") 순서 분석
- **논쟁:** 순서가 정말 품질에 영향 주는지 독립적 근거 약함 → 실험 필요
- **검증 필요:** A/B 테스트

### C-006 · 질문 vs 명령 일관성 — *미구현*
- **Status:** hypothesis · **Confidence:** low
- **정의:** 한 프롬프트에 질문(?)과 명령(~해줘)이 섞이면 모델 혼란
- **감지 방법:** `?` 문장 수 vs 명령형 문장 수 모두 > 0
- **검증 필요:** 실제 혼란 유발하는지 대조 실험

### C-007 · 코드 덤프 (instruction 없음)
- **Status:** validated · **Confidence:** high · **Rule:** R012
- **현재 threshold:** 코드블록이 본문의 **80% 이상**
- **놓치는 패턴:** 70% 코드 + 짧은 질문("이거 왜?") → 감지 안 됨. threshold 조정 또는 복합 룰 필요.
- **개선 제안:** threshold 65%로 완화 + "짧은 질문은 더 엄격"

### C-008 · 구분자 사용 일관성 — *미구현*
- **Status:** hypothesis · **Confidence:** low
- **정의:** `---`, `###`, `[TAG]`, `//` 등을 혼용하면 파싱 혼란
- **감지 방법:** 구분자 패턴 정규식 + 종류 수 카운트
- **검증 필요:** 실제 영향 측정

---

## 4. CTX — 맥락 (Context)

### C-009 · 도메인·프로젝트 맥락 부재
- **Status:** validated · **Confidence:** high · **Rule:** R003
- **개선 제안:** 현재 한국어 키워드가 좁음 (§10 확장 계획)

### C-010 · 대상 독자(Audience) 명시 — *미구현*
- **Status:** hypothesis · **Confidence:** medium
- **정의:** 답변의 수신자 명시 여부 ("시니어 개발자에게 설명"/"초보자용")
- **감지 방법:** 키워드 패턴 (`초보자/beginner/senior/non-technical`) 존재 여부
- **예:** "JWT 어떻게 쓰나?" (애매) vs "5분 전에 Node 배운 사람한테 JWT 간단히 설명해줘" (명확)

### C-011 · 현재 상태·이미 시도한 것 — *미구현*
- **Status:** hypothesis · **Confidence:** high
- **정의:** "나는 이미 X를 해봤다. Y는 실패했다" 같은 현 상태 기술
- **감지 방법:** "해봤/tried/already" 류 패턴
- **중요성:** 이 정보 없으면 모델이 이미 시도한 접근을 다시 제안 → 시간 낭비

### C-012 · 부정 제약 (Negative Constraints) — *미구현*
- **Status:** hypothesis · **Confidence:** medium
- **정의:** "~는 하지 마라" 같은 명시적 금지 조건
- **감지 방법:** 부정어 + 명령형 패턴
- **예:** "외부 라이브러리 추가 금지", "force push 하지 마"
- **중요성:** 음의 제약은 양의 요청만큼 결과 경로를 좁힘

### C-013 · 환경/버전 명시 (Code 도메인) — *미구현*
- **Status:** hypothesis · **Confidence:** high (code 도메인 한정)
- **정의:** "Node 20", "Python 3.12", "React 19" 같은 버전 정보
- **감지 방법:** 잘 알려진 기술명 + 버전 패턴 (`\w+\s+\d+(\.\d+)?`)
- **왜 중요:** 버전 간 API 차이 → 잘못된 답 가능성

### C-014 · 입력 예시 제공 (expected input shape) — *미구현*
- **Status:** hypothesis · **Confidence:** medium
- **정의:** "입력은 이런 형태" 라는 샘플 데이터 제공
- **감지 방법:** 코드블록 내 JSON·YAML 등 샘플 패턴
- **구분:** C-032 출력 예시와 다름 (입력 vs 출력)

### C-015 · 에러 메시지 포함 — *미구현*
- **Status:** hypothesis · **Confidence:** high (code 도메인)
- **정의:** 디버깅 요청 시 에러 메시지 첨부
- **감지 방법:** "Error:", "Exception:", "TypeError" 같은 스니펫 패턴
- **왜 중요:** 에러 없이 "코드가 안 돼요"는 가장 비싼 카테고리 (모델이 추측만 함)

---

## 5. OUT — 출력 정의 (Output Spec)

### C-016 · 출력 포맷 미지정
- **Status:** validated · **Confidence:** high · **Rule:** R002
- **확장 필요:** 현재 키워드가 제한적. 음성(`말해줘`), 표(`table/테이블`), 구조화된 형식 더 많이 추가.

### C-017 · 출력 길이 제약 미지정
- **Status:** validated · **Confidence:** high · **Rule:** R010
- **개선 제안:** "짧게/간단히" 같은 정성 표현도 감지

### C-018 · 출력 언어 미지정 — *미구현*
- **Status:** hypothesis · **Confidence:** medium
- **정의:** 한국어/영어 중 어느 언어로 답해야 하는지 명시 여부
- **왜 중요:** 한국어 프롬프트에 영어로 답하면 독자에게 부하

### C-019 · 출력 톤(Tone) 미지정 — *미구현*
- **Status:** hypothesis · **Confidence:** low
- **정의:** 공식/캐주얼/유머 등 톤 명시
- **우선순위 낮음**

### C-020 · 성공 기준 (Acceptance Criteria)
- **Status:** validated · **Confidence:** high · **Rule:** R006
- **개선 제안:** 부분 점수 — 기준이 모호하면 경고 (예: "잘 되면 OK")

### C-021 · 예시의 적절성 — *미구현*
- **Status:** hypothesis · **Confidence:** high
- **정의:** 예시가 있긴 하나 실제 요청과 mismatch
- **감지 방법:** LLM 심판 영역 — "이 예시가 요청 이해에 도움 되나?" 평가
- **검증 필요:** 코퍼스 수집

---

## 6. CLR — 명확성 (Clarity)

### C-022 · 대명사 모호성
- **Status:** validated · **Confidence:** high · **Rule:** R007

### C-023 · 모호한 부사 ("좀/대충/적당히") — *미구현*
- **Status:** hypothesis · **Confidence:** medium
- **감지 방법:** 한국어: `좀|대충|적당히|그냥|알아서`, 영어: `somewhat|kinda|sorta|maybe|probably|like`
- **severity 제안:** sev 2 — 심하진 않지만 경고

### C-024 · 정량화 가능한 표현 부재 — *미구현*
- **Status:** hypothesis · **Confidence:** medium
- **정의:** "빨리", "많이", "잘" → 정량 기준 없음
- **감지 방법:** 정량 표현 패턴 매칭 (수사 + 단위) → 없으면 플래그

### C-025 · 구두점·띄어쓰기 — *미구현*
- **Status:** hypothesis · **Confidence:** low
- **정의:** 한 문단에 띄어쓰기 전혀 없거나, 마침표 없이 긴 문장
- **한국어 특수:** 띄어쓰기 의존도 높음 → 영향 큼 가능성
- **검증 필요**

### C-026 · 명령형 동사 명시
- **Status:** validated · **Confidence:** high · **Rule:** R009
- **확장:** 영어 명령형 커버리지 보강 (현재 한국어 중심)

### C-027 · 의도의 단일성 (Core Intent) — *미구현*
- **Status:** hypothesis · **Confidence:** high
- **정의:** 한 프롬프트가 하나의 분명한 "목표"로 수렴하는가
- **감지 방법:** LLM 심판 — 복수 목표 감지 시 감점

---

## 7. LNG — 언어·문체

### C-028 · 오타·맞춤법 (영어)
- **Status:** hypothesis · **Confidence:** medium
- **감지 방법:** `hunspell` / `nspell` 스펠체커 — 오류 단어 비율 계산
- **주의:** 코드/고유명사 제외 필요 (false positive 방지)

### C-029 · 오타·맞춤법 (한국어)
- **Status:** hypothesis · **Confidence:** low (기술 난이도)
- **기술 난이도:** 한국어 형태소 분석 + 사전 필요 (`hunspell-ko` · `py-hanspell`)
- **대안:** Node.js 생태계 약함 → Python 워커 또는 WASM 바인딩 필요
- **우선순위:** 낮음 (false positive 위험 vs 품질 영향 불확실)

### C-030 · 문법 오류 — *미구현*
- **Status:** hypothesis · **Confidence:** low
- **정의:** 문법 오류가 모델 이해를 얼마나 방해하나
- **논쟁:** LLM은 문법 오류에 관대 → 영향 작을 수 있음
- **검증 필요**

### C-031 · 존댓말/반말 일관성 — *미구현*
- **Status:** hypothesis · **Confidence:** low
- **정의:** 한 프롬프트에 `~해줘` + `~하세요` 혼용
- **영향도:** 모델에겐 거의 무영향. 사람 독자(코드 리뷰)엔 영향.

### C-032 · 전문용어 일관성 — *미구현*
- **Status:** hypothesis · **Confidence:** medium
- **정의:** 같은 개념을 다른 용어로 지칭 ("데이터베이스" vs "DB" vs "저장소")
- **감지 방법:** 동의어 사전 기반 빈도 비교

### C-033 · 과도한 경어/에둘러 말하기 — *미구현*
- **Status:** hypothesis · **Confidence:** low
- **예:** "혹시 이것 좀 부탁드려도 될까요 혹시나 가능하시면..."
- **영향:** 토큰 낭비 + 핵심 희석

### C-034 · 욕설·비속어
- **Status:** hypothesis · **Confidence:** low · **Rule:** (none)
- **정의:** 비속어 포함 여부
- **토론:** 개인 로컬 툴이라 "개인 자유" 영역. 팀 공유 시 문제.
- **감지 방법:** 한국어(씨발/병신/존나 등) + 영어(fuck/shit/etc) 사전
- **severity 제안:** sev 1 (경고만)
- **구현 우선순위:** 낮음 (논쟁적)

---

## 8. SAF — 안전·윤리

### C-035 · 프롬프트 인젝션 유도
- **Status:** validated · **Confidence:** high · **Rule:** R005 (sev 5)

### C-036 · PII 노출 (프롬프트 내) — *부분 구현*
- **Status:** prototyped · **Confidence:** high
- **현재:** `packages/core/src/pii.ts` 가 저장 전 마스킹. 스코어엔 반영 안 됨.
- **제안:** PII 감지 시 `C-036` 룰로 경고 (저장은 되지만 유저 주의 환기)

### C-037 · 해로운 의도 패턴 — *미구현*
- **Status:** hypothesis · **Confidence:** low
- **정의:** 명백한 악의 (예: "이 사람 주소 알려줘") — 매우 희귀
- **감지:** LLM 심판 쪽이 더 적절 (룰은 false positive 많음)
- **우선순위:** 매우 낮음 (Claude 자체가 이미 막음)

### C-038 · 저작권·라이선스 위반 요청 — *미구현*
- **Status:** hypothesis · **Confidence:** low
- **예:** "이 유료 소프트웨어 크랙해줘"
- **우선순위:** 매우 낮음

### C-039 · 민감 정보 요구 유도 — *미구현*
- **Status:** hypothesis · **Confidence:** low
- **정의:** 모델이 사용자에게 "패스워드 말해줘" 유도되는 프롬프트
- **우선순위:** 매우 낮음

---

## 9. TUL — 도구 활용 (Claude Code 특화)

### C-040 · 읽어야 할 파일 명시 — *미구현*
- **Status:** hypothesis · **Confidence:** high (code 도메인)
- **정의:** "src/db.ts 를 보고…" 같은 경로 명시
- **감지 방법:** 파일 경로 패턴 (`\w+/[\w.]+\.\w+`) 존재 여부
- **효과:** 모델이 Read 도구로 바로 접근 → 추측 대신 사실 기반 답

### C-041 · 금지 작업 명시 — *미구현*
- **Status:** hypothesis · **Confidence:** medium
- **예:** "force push 금지", "git reset --hard 쓰지 마"
- **Claude Code 맥락에서 중요:** 실제 파괴적 작업 방지

### C-042 · 승인 필요 작업 플래그 — *미구현*
- **Status:** hypothesis · **Confidence:** low
- **정의:** "먼저 확인하고 진행해" 표시
- **감지:** "확인해줘/먼저 물어봐/approve first" 패턴

### C-043 · 테스트 실행 요청 — *미구현*
- **Status:** hypothesis · **Confidence:** high (code 도메인)
- **정의:** "테스트 통과까지" 같은 검증 요구
- **감지:** `test|테스트|ci|pass` 패턴

---

## 10. CNV — 대화 연속성

### C-044 · 이전 턴 앵커 모호 — *부분 구현*
- **Status:** prototyped · **Confidence:** high · **Rule:** R007 (대명사)
- **확장 제안:** `위`, `이거`, `그거` 외에 `이전에/방금/아까` 등도

### C-045 · 세션 cold start 맥락 부족 — *미구현*
- **Status:** hypothesis · **Confidence:** high
- **정의:** 새 세션 첫 턴(turn_index=0)인데 "그거 고쳐줘" 같이 앵커가 세션 밖
- **감지 방법:** `turn_index == 0 && ambiguous_pronoun_start` 복합 조건

### C-046 · 되돌아가는 수정 요청의 구체성 — *미구현*
- **Status:** hypothesis · **Confidence:** medium
- **정의:** "아니 그게 아니고 다시" 같은 재요청의 방향성
- **감지:** 수정 신호어 + 구체적 차이 명시 여부

### C-047 · 대화 길이 한계 — *미구현*
- **Status:** hypothesis · **Confidence:** medium
- **정의:** 한 세션이 너무 길어져 컴팩션 반복 → 컨텍스트 유실
- **감지:** `PreCompact` 이벤트 카운트 + 경고

---

## 11. MLG — 다국어·혼용

### C-048 · 한·영 혼용 적절성 — *미구현*
- **Status:** hypothesis · **Confidence:** medium
- **정의:** 어떤 혼용은 자연스럽고(전문용어), 어떤 혼용은 산만함.
- **적절한 혼용:** 코드·영어 용어 그대로, 설명은 한국어
- **부적절한 혼용:** 문장 중간 랜덤 영어 단어 ("이거 좀 fix 해줘 플리즈")
- **감지 방법 후보:** 문장 단위로 언어 판정 → 과도한 스위칭 감지

### C-049 · 일본어 지원 — *미구현*
- **Status:** hypothesis · **Confidence:** low
- **정의:** 일본어 프롬프트도 동일한 품질 평가
- **기술 난이도:** 언어 판정 라이브러리(`franc` 등) + 각 언어별 키워드 사전

### C-050 · 중국어 지원 — *미구현*
- **Status:** hypothesis · **Confidence:** low

### C-051 · 자동 언어 감지 — *미구현*
- **Status:** hypothesis · **Confidence:** high (기반 기술 존재)
- **감지 방법:** `franc-min` 같은 라이브러리로 언어 감지 → 메시지·룰을 해당 언어로 디스패치
- **선행 조건:** 각 언어별 키워드 사전 구축

---

## 12. COD — 코드 특화

### C-052 · 스택 명시
- **Status:** hypothesis · **Confidence:** high
- **정의:** "TypeScript", "React" 같은 스택 언급 여부
- **부분 커버:** C-009(R003) CONTEXT_KEYWORDS에 일부 포함

### C-053 · 컴파일/런타임 구분 — *미구현*
- **Status:** hypothesis · **Confidence:** low
- **정의:** 컴파일 에러 vs 런타임 에러 명시

### C-054 · 재현 단계 (STR) — *미구현*
- **Status:** hypothesis · **Confidence:** high
- **정의:** "1단계 X, 2단계 Y 했더니 Z가 나옴" 형식
- **감지:** 번호 매겨진 단계 + 결과

### C-055 · 기대·실제 분리 — *미구현*
- **Status:** hypothesis · **Confidence:** high
- **정의:** "기대했던 결과: X, 실제: Y"
- **감지:** `expected/기대/actual/실제` 패턴

---

## 13. MDL — 모델 특화

### C-056 · Claude 특화 (Constitutional AI 고려) — *미구현*
- **Status:** hypothesis · **Confidence:** low
- **정의:** Claude가 잘 응답하는 패턴 (XML 태그, step-by-step 유도 등)

### C-057 · 다중 모델 호환 — *미구현*
- **Status:** hypothesis · **Confidence:** low
- **정의:** 같은 프롬프트의 ChatGPT/Claude/Gemini 적합도 차이

### C-058 · 모델 버전별 팁 — *미구현*
- **Status:** hypothesis · **Confidence:** low

---

## 14. FMT — 포맷팅

### C-059 · 마크다운 사용 — *미구현*
- **Status:** hypothesis · **Confidence:** low
- **정의:** 긴 프롬프트에 마크다운 구조 여부

### C-060 · 코드블록 언어 태그 — *미구현*
- **Status:** hypothesis · **Confidence:** medium
- **정의:** ` ``` ` 뒤 언어 명시 (`ts`, `python` 등)
- **감지:** 코드블록 정규식에서 언어 태그 추출 → 태그 없으면 경고

### C-061 · 과도한 이모지·장식 — *미구현*
- **Status:** hypothesis · **Confidence:** low
- **정의:** 문장 반 이상이 이모지
- **감지:** unicode 이모지 비율

### C-062 · 들여쓰기 일관성 — *미구현*
- **Status:** hypothesis · **Confidence:** low
- **정의:** 프롬프트 내 코드블록의 들여쓰기 tab/space 혼용

---

## 15. 감지 전략 매트릭스

각 criterion을 감지 방법별로 재분류.

### 15.1 룰 (결정론) — 감지 100ms 내 가능
**30개 criterion** (의도: 결정 가능, 설명 가능, 비용 0)

C-001/002/004/007/009/010/011/012/013/014/015/016/017/018/020/022/023/024/026/028/035/036/040/041/043/052/054/055/060/062

### 15.2 LLM 심판 (Judge)
**15개 criterion** (의도: 맥락 판단, 도메인 지식, 애매함 해소)

C-003/005/006/019/021/027/029/030/033/037/044/045/046/048/056

### 15.3 실사용 메트릭 (Usage)
**7개 criterion** (의도: 결과로 역추론)

C-047/053/057/058 + 향후 피드백(👍/👎) 통합 후 추가

### 15.4 복합 (여러 signal 필요)
C-011(현재상태) — 룰 + LLM
C-021(예시 적절성) — 룰(존재) + LLM(품질)

---

## 16. 현재 구현 매핑 (R001~R012 ↔ Criterion)

| 룰 | 커버 criterion | 비고 |
|---|---|---|
| R001 too_short | C-001 | validated |
| R002 no_output_format | C-016 | 키워드 확장 필요 |
| R003 no_context | C-009 | 키워드 다국어 확장 필요 |
| R004 multiple_tasks | C-004 | 구분자 다변화 필요 (`//` 추가) |
| R005 injection_attempt | C-035 | 최신 공격 패턴 주기 업데이트 |
| R006 no_success_criteria | C-020 | |
| R007 ambiguous_pronoun | C-022 + 부분 C-044 | |
| R008 no_examples_when_complex | C-002 | 재검토 필요 |
| R009 imperative_missing | C-026 | 영어 커버리지 보강 |
| R010 no_constraint | C-017 | |
| R011 question_without_context | C-009 + C-045 부분 | |
| R012 code_dump_no_instruction | C-007 | threshold 조정 검토 |

**커버 criterion: 12 / 62 = 19.4%.** 갈 길이 멀다.

---

## 17. 검증 프로세스 (Validation Methodology)

### 17.1 각 criterion의 검증 단계

```
hypothesis  →  prototyped  →  validated  →  (production)
                                     ↘
                                       discarded
```

**hypothesis → prototyped:** 룰/LLM 프롬프트로 구현 + 10개 샘플 수동 라벨링 일치
**prototyped → validated:** 100개 샘플에서 precision ≥ 80% AND recall ≥ 70%
**validated → discarded:** production에서 false positive 지속 발생 시 downgrade

### 17.2 검증 데이터셋

**목표:** `docs/corpora/` 하위에 라벨링된 프롬프트 JSON 구축.

구조:
```json
{
  "id": "COR-001",
  "prompt": "fix",
  "labels": {
    "C-001": true,      // 해당 criterion에 해당하는가
    "C-009": true,
    "C-016": true
  },
  "rule_hits_expected": ["R001", "R002", "R003"],
  "source": "dogfood-2026-04-20",
  "language": "ko"
}
```

**초기 코퍼스 목표:**
- 100개 실제 프롬프트 (도그푸딩에서 수집)
- 50개 합성 edge case
- 20개 다국어 샘플 (한·영·일·중 각 5개)

### 17.3 평가 지표

Criterion별:
- **Precision:** 룰이 fire 한 중 실제 해당 문제 있는 비율
- **Recall:** 실제 문제 있는 중 룰이 fire 한 비율
- **F1**

전체 스코어:
- **Kendall tau:** 룰 스코어 순위 vs LLM 심판 순위 상관
- **User agreement:** 유저가 고친 프롬프트와 기존 프롬프트 간 스코어 차이

### 17.4 주기

| 주기 | 내용 |
|---|---|
| 주 1회 | 새 criterion에 대한 GitHub Discussion |
| 월 1회 | 랜덤 100개 프롬프트 샘플링 + precision/recall 측정 |
| 분기 1회 | 이 문서 전체 리뷰 + status 전환 결정 |
| 릴리스 전 | 코퍼스 기준 regression test 통과 필수 |

---

## 18. 우선순위 로드맵

### v0.1.1 (즉시)
룰 5개 확장·신규 추가:
- [ ] R004 확장: `//` · `,` 구분자 추가 (C-004)
- [ ] R012 threshold 80% → 65% (C-007)
- [ ] R003 CONTEXT_KEYWORDS 다국어 확장 (C-009, C-048, C-049, C-050)
- [ ] R013 신규: PII-aware 경고 (C-036)
- [ ] R014 신규: 모호한 부사 감지 (C-023)

### v0.1.2 (다음 단계)
- [ ] R015 현재상태 표시 (C-011)
- [ ] R016 환경/버전 명시 (C-013)
- [ ] R017 에러 메시지 포함 (C-015)
- [ ] R018 파일 경로 명시 (C-040)
- [ ] 초기 코퍼스 100개 수집 + 라벨링

### v0.2
- [ ] LLM 심판 확장: 15개 judge 대상 criterion
- [ ] 자동 언어 감지 (C-051) → 메시지 다국어화
- [ ] 유저 피드백(👍/👎) 수집 UI

### v0.3
- [ ] 모델 특화 팁 (C-056, C-057)
- [ ] 오타 감지 (C-028, C-029) — 기술 성숙 후

---

## 19. 기여 가이드 — 새 criterion 제안하는 법

1. **GitHub Issue 생성** (label: `criterion-proposal`)
2. 다음 템플릿 채움:
   ```md
   ## C-NNN · <이름>
   - Status: hypothesis
   - Confidence: low/medium/high + 근거
   - 정의: <한 문단>
   - 감지 방법: <rule/llm/both>
   - 예시: 좋은 프롬프트 / 나쁜 프롬프트 5개
   - 언어 특수성: <해당되면>
   - 검증 계획: <어떻게 precision/recall 측정할지>
   ```
3. 논의 후 합의되면 PR로 이 문서에 추가

---

## 20. 참고 문헌 & 관련 자료

### 공식 가이드
- [Anthropic Prompt Engineering Guide](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/overview)
- [OpenAI Prompt Engineering](https://platform.openai.com/docs/guides/prompt-engineering)
- [Google Gemini Prompting Best Practices](https://ai.google.dev/gemini-api/docs/prompting-intro)

### 학술
- "Prompt Engineering Patterns" — MIT Press review (TBD)
- "Chain of Thought Prompting" (Wei et al., 2022)
- "Self-Consistency Improves Chain of Thought" (Wang et al., 2022)

### 관련 오픈소스
- PromptLayer — 프롬프트 로깅·버전관리
- Langsmith — LLM observability
- PromptRepository — 타입세이프한 프롬프트 템플릿

### 내부 연관 문서
- [05-quality-engine.md](./05-quality-engine.md) — 스코어 공식
- [00-decision-log.md](./00-decision-log.md) — D-006(스코어 구성), D-020(M0 검증)
- [99-observation-log.md](./99-observation-log.md) — 실측 기록

---

## 21. 변경 이력 (이 문서)

| 날짜 | 변경 | 작성자 |
|---|---|---|
| 2026-04-20 | v0 초안 — 62 criterion 분류, 12 대분류, 검증 방법론 | 초기 |
| — | (다음 업데이트 여기 append) | — |

---

## 22. 미해결 / 토론 필요

이 문서 작성 시점 기준 미결정 항목:

1. **`//` 구분자 감지 구현 level:** 룰 레벨(R004 확장) vs 별도 룰?
2. **한국어 오타 감지:** 기술 난이도 감안 시 포함 여부 — 기각?
3. **욕설 감지 정책:** 개인 로컬이라 감점 대상 아님 → 경고만? 아예 제외?
4. **모델 특화 criterion(C-056~C-058):** 현재 Claude Code만 대상이라 모델 차별화 의미 있는지
5. **코퍼스 공개 여부:** 검증용 실프롬프트 → 프라이버시. 완전 합성 코퍼스로 대체?

**→ 각 항목 GitHub Discussion으로 분리 제안.**

---

## 부록 A. Criterion Quick Reference

62개 criterion ID 인덱스 (가나다 / 알파벳 순 아님, 카테고리 순).

| ID | 이름 | 카테고리 | Rule | Status |
|---|---|---|---|---|
| C-001 | 단어 수 과소 | STR | R001 | ✅ validated |
| C-002 | 긴데 예시 없음 | STR | R008 | ⚠️ medium |
| C-003 | 산만함 | STR | — | 🧪 hypothesis |
| C-004 | 다중 태스크 | STR | R004 | ✅ validated |
| C-005 | 섹션 순서 | STR | — | 🧪 hypothesis |
| C-006 | 질문/명령 혼재 | STR | — | 🧪 hypothesis |
| C-007 | 코드 덤프 | STR | R012 | ✅ validated |
| C-008 | 구분자 일관성 | STR | — | 🧪 hypothesis |
| C-009 | 맥락 없음 | CTX | R003 | ✅ validated |
| C-010 | 대상 독자 | CTX | — | 🧪 hypothesis |
| C-011 | 시도 이력 | CTX | — | 🧪 hypothesis |
| C-012 | 부정 제약 | CTX | — | 🧪 hypothesis |
| C-013 | 환경/버전 | CTX | — | 🧪 hypothesis |
| C-014 | 입력 예시 | CTX | — | 🧪 hypothesis |
| C-015 | 에러 메시지 | CTX | — | 🧪 hypothesis |
| C-016 | 출력 포맷 | OUT | R002 | ✅ validated |
| C-017 | 출력 길이 | OUT | R010 | ✅ validated |
| C-018 | 출력 언어 | OUT | — | 🧪 hypothesis |
| C-019 | 출력 톤 | OUT | — | 🧪 hypothesis |
| C-020 | 성공 기준 | OUT | R006 | ✅ validated |
| C-021 | 예시 적절성 | OUT | — | 🧪 hypothesis |
| C-022 | 대명사 모호 | CLR | R007 | ✅ validated |
| C-023 | 모호 부사 | CLR | — | 🧪 hypothesis |
| C-024 | 비정량 표현 | CLR | — | 🧪 hypothesis |
| C-025 | 띄어쓰기/구두점 | CLR | — | 🧪 hypothesis |
| C-026 | 명령형 동사 | CLR | R009 | ✅ validated |
| C-027 | 의도 단일성 | CLR | — | 🧪 hypothesis |
| C-028 | 오타 (en) | LNG | — | 🧪 hypothesis |
| C-029 | 오타 (ko) | LNG | — | 🧪 hypothesis |
| C-030 | 문법 오류 | LNG | — | 🧪 hypothesis |
| C-031 | 존댓말/반말 | LNG | — | 🧪 hypothesis |
| C-032 | 전문용어 일관 | LNG | — | 🧪 hypothesis |
| C-033 | 과도한 경어 | LNG | — | 🧪 hypothesis |
| C-034 | 욕설 | LNG | — | 🧪 hypothesis |
| C-035 | 프롬프트 인젝션 | SAF | R005 | ✅ validated |
| C-036 | PII 노출 | SAF | (pii.ts) | ⚠️ 부분 |
| C-037 | 해로운 의도 | SAF | — | 🧪 low |
| C-038 | 저작권 위반 | SAF | — | 🧪 low |
| C-039 | 민감 정보 유도 | SAF | — | 🧪 low |
| C-040 | 파일 경로 명시 | TUL | — | 🧪 hypothesis |
| C-041 | 금지 작업 명시 | TUL | — | 🧪 hypothesis |
| C-042 | 승인 플래그 | TUL | — | 🧪 hypothesis |
| C-043 | 테스트 요구 | TUL | — | 🧪 hypothesis |
| C-044 | 이전 턴 앵커 | CNV | R007 부분 | ⚠️ 부분 |
| C-045 | Cold start | CNV | — | 🧪 hypothesis |
| C-046 | 재요청 구체성 | CNV | — | 🧪 hypothesis |
| C-047 | 세션 과다 | CNV | — | 🧪 hypothesis |
| C-048 | 한·영 혼용 | MLG | — | 🧪 hypothesis |
| C-049 | 일본어 | MLG | — | 🧪 low |
| C-050 | 중국어 | MLG | — | 🧪 low |
| C-051 | 언어 감지 | MLG | — | 🧪 hypothesis |
| C-052 | 스택 명시 | COD | R003 부분 | ⚠️ 부분 |
| C-053 | 컴파일/런타임 | COD | — | 🧪 low |
| C-054 | 재현 단계 | COD | — | 🧪 hypothesis |
| C-055 | 기대·실제 분리 | COD | — | 🧪 hypothesis |
| C-056 | Claude 특화 | MDL | — | 🧪 low |
| C-057 | 다중 모델 호환 | MDL | — | 🧪 low |
| C-058 | 모델 버전 팁 | MDL | — | 🧪 low |
| C-059 | 마크다운 사용 | FMT | — | 🧪 low |
| C-060 | 코드블록 언어 | FMT | — | 🧪 hypothesis |
| C-061 | 이모지 과다 | FMT | — | 🧪 low |
| C-062 | 들여쓰기 일관 | FMT | — | 🧪 low |
