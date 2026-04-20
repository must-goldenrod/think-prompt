# 06 · 코칭 UX (대시보드 · 인라인 · CLI)

> 수집된 데이터를 유저가 실제로 소비하는 3개 표면.

---

## 1. 로컬 대시보드 (`http://127.0.0.1:47824`)

### 1.1 공통 레이아웃
- 상단: 프로젝트 선택(cwd), 기간(오늘/7일/30일).
- 좌측 사이드바: `프롬프트` · `세션` · `룰` · `설정` · `진단(`think-prompt doctor` 결과`)`.

### 1.2 `/` (Overview)
- 오늘/주간 프롬프트 수, 평균 스코어, Tier 분포 도넛.
- "낮은 스코어 TOP 5" 카드 — 각 항목 클릭 시 상세로.
- "이번 주 가장 자주 히트한 룰 TOP 3" 카드.

### 1.3 `/prompts`
- 테이블: `시간 · 프로젝트 · 앞 60자 · score · tier · 룰 히트 수`.
- 필터: tier, 룰 ID, 날짜, 프로젝트.
- 검색: 본문 like, 해시 exact.

### 1.4 `/prompts/:id`
- 원문 블록 (복사 버튼).
- 옆에 점수 breakdown:
  - Rule score N (각 룰 히트 리스트 · severity 색)
  - Usage score M (세션 끝난 후 표시)
  - Judge score K (LLM ON일 때 표시)
  - Final
- 하단 버튼: **`개선안 보기`** (리라이터 호출) → 우측에 diff 패널 슬라이드인.
- 연관 서브에이전트 호출 리스트 (있으면).
- 같은 `prompt_hash` 이전 등장 횟수.

### 1.5 `/sessions/:id`
- 세션 타임라인: 유저 턴 → 도구 호출 rollup → 서브에이전트 호출 → Stop.
- 각 턴을 클릭하면 해당 `prompt_usages` 상세로 이동.

### 1.6 `/rules`
- 룰 카탈로그: ID · 이름 · 카테고리 · severity · 히트 수(이번 주).
- 각 룰 ON/OFF 토글 (설정 파일 반영).

### 1.7 `/settings`
- coach mode 토글
- LLM ON/OFF + API 키 상태 확인
- 보존 기간
- 서버 동기화 토글 (MVP에선 Disabled 표시)
- 데몬 상태/재기동 버튼
- **데이터 완전 삭제** 버튼 (확인 모달 2단계)

### 1.8 `/doctor`
`think-prompt doctor` 결과를 브라우저에서도 확인. 훅 설치 상태 · 데몬 상태 · DB 무결성 · 최근 에러.

### 1.9 기술 노트
- Fastify + `@fastify/view` + eta 템플릿.
- htmx로 부분 갱신. Alpine으로 인터랙션.
- 자동 새로고침: 대시보드 포그라운드일 때 SSE(`/events`)로 새 prompt_usage 알림.
- 번들러 없음. Tailwind는 CDN JIT(dev), 릴리스 빌드에선 프리컴파일된 CSS 한 파일.

---

## 2. 인라인 코칭 (`additionalContext` 주입)

### 2.1 언제 주입되나
- `config.agent.coach_mode = true` 여야.
- 해당 프롬프트의 룰 스코어가 임계 이하(기본 65) 또는 severity ≥ 3 룰 히트가 있을 때.
- 세션당 최초 1회 혹은 마지막 주입 후 3턴 경과 시에만 (도배 방지).

### 2.2 주입 템플릿
```
[Think-Prompt coaching hint]
The user's prompt has these quality issues (from local rule checks):
- R003 (no_context): no project/domain context given
- R010 (no_constraint): output length/language not specified

Before answering, briefly confirm with the user:
1) What project or domain this is about
2) Expected output format and size

If you can reasonably infer from the current conversation, proceed — but call out your assumptions explicitly.
[end hint]
```

### 2.3 제한
- `additionalContext` 10 KB 상한 엄수.
- 힌트 길이 1 KB 이내.
- coach mode OFF면 완전 무음.

---

## 3. CLI (`think-prompt ...`)

모든 명령은 `--json` 플래그 지원(스크립트용).

| 명령 | 설명 |
|---|---|
| `think-prompt install` | 최초 설치: 디렉토리 생성 · DB 마이그레이션 · settings.json 훅 병합 · 데몬 start |
| `think-prompt uninstall` | 훅 블록 제거 · 데몬 stop. 데이터는 유지. `--purge`로 전체 삭제. |
| `think-prompt start` / `stop` / `restart` | 데몬 제어 |
| `think-prompt status` | 에이전트/워커 PID · 포트 · 최근 에러 · DB 크기 |
| `think-prompt doctor` | 설치 무결성 + 훅 payload 도달 여부 + 샘플 이벤트 재생 |
| `think-prompt list [--tier bad] [--rule R003] [--limit 20]` | 프롬프트 목록 |
| `think-prompt show <usage_id>` | 상세 + 룰 히트 + 스코어 |
| `think-prompt rewrite <usage_id>` | 리라이터 호출, diff 출력 |
| `think-prompt config get/set/list` | 설정 조회·수정 |
| `think-prompt coach on/off` | 코치 모드 토글 (= `config set agent.coach_mode`) |
| `think-prompt reprocess [--session id / --all]` | 룰 버전 갱신 후 재채점 |
| `think-prompt wipe` | 전체 데이터 + 훅 제거 (2단계 확인) |
| `think-prompt export [--since 30d] --out file.json` | 유저 소유 데이터 내보내기 |

### 3.1 `doctor` 세부
`think-prompt doctor` 가 검사하는 항목:
1. `~/.claude/settings.json` 존재 + 우리 훅 블록 포함
2. 에이전트 데몬 살아 있고 포트 응답
3. 워커 데몬 살아 있음
4. DB schema_version == 최신
5. 최근 24h 내 `prompt_usages` 존재 여부 (0건이면 훅 미작동 의심)
6. 최근 에러 로그 tail 20줄
7. Anthropic API 키 유효성(LLM ON일 때만)

출력:
```
Think-Prompt Doctor
─────────────────
✓ Hook installed in ~/.claude/settings.json
✓ Agent daemon running (pid 12345, :47823)
✓ Worker daemon running (pid 12346)
✓ Database schema_version=3 (current)
⚠ No prompt_usages in last 24h — hook may not be firing.
  Try: run `claude` and type anything, then `think-prompt doctor` again.
✓ Config valid
⊘ LLM disabled (set llm.enabled=true to enable)
```

---

## 4. 접근성·i18n

- 메시지 언어: config.i18n = `"ko"` | `"en"` (기본 `"ko"`, 프롬프트 본문 언어 자동감지로 힌트 언어 맞춤).
- 대시보드 다크 모드(system follow).
- 키보드 내비게이션(테이블 j/k, 검색 `/`).
