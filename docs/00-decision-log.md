# 00 · 의사결정 로그 (Decision Log)

> 모든 중요한 의사결정을 한 곳에 남긴다. 나중에 문제가 터졌을 때 **"왜 이렇게 결정했는지"** 를 바로 되짚기 위함.
>
> - 새 결정이 추가되면 가장 아래에 append (ID 증가).
> - 결정이 번복되면 **취소선** 처리 + 재결정 D-번호에서 "Supersedes D-xxx" 명시.
> - 날짜·컨텍스트·대안·근거를 반드시 기록.

---

## D-001 · 타겟 & 배포 모델
- **날짜:** 2026-04-20
- **컨텍스트:** B2C(개인 개발자) vs B2B(팀/회사) 중 어디부터?
- **대안:** ① B2B 먼저(팀 기능·RBAC·PR), ② 개인 무료 먼저 후 팀으로 확장
- **결정:** **② 개인 개발자 · 무료 공개** 먼저. B2B는 사용자 확보 후 재검토.
- **근거:** 사용자 풀 확보 · 바이럴 속도 · 초기 피드백 루프 단축. Claude Code 사용자 = 개발자이므로 타겟 일치.
- **영향:** 팀 RBAC · PR/리뷰 워크플로 · SSO 등은 MVP에서 전부 제거.

## D-002 · 핵심 포지션
- **날짜:** 2026-04-20
- **컨텍스트:** "로깅/관측 툴"로 갈지, "프롬프트 코치"로 갈지.
- **대안:** ① 관측 단독, ② 코치 단독, ③ 둘 다
- **결정:** **③ 수집 + 개선 둘 다**를 1급 기능으로.
- **근거:** 수집 없이는 코치 근거가 없고, 코치 없이는 차별화가 없다. 두 기능의 데이터 파이프라인이 어차피 공유됨.
- **영향:** 대시보드(관측) + 인라인 코칭(개선)을 병행 구축.

## D-003 · MVP 첫 수집 채널
- **날짜:** 2026-04-20
- **컨텍스트:** 동시에 다 건드릴 수 없음. 한 채널에 집중.
- **대안:** SDK 프록시 / CLI 래퍼 / Claude Code 훅 / Cursor 확장 / 브라우저 확장
- **결정:** **Claude Code 훅** 최우선(단독으로 MVP 시작).
- **근거:** 개인 개발자 타겟과 완벽히 일치. 공식 훅 시스템 존재 → 구현 난이도 낮음. 로컬 실행 구조로 프라이버시 허들 최소. 사용자와 같은 도구를 우리가 매일 씀(도그푸딩 용이).
- **영향:** 다른 채널은 Phase 2 이후. MVP의 모든 설계는 Claude Code hook payload 구조에 맞춘다.

## D-004 · 저장 기본 모드
- **날짜:** 2026-04-20
- **컨텍스트:** 원문 프롬프트를 어디에 저장할지.
- **대안:** ① 서버 중심(마스킹 후 서버), ② 로컬 중심(원문은 PC, 서버엔 해시/메트릭만)
- **결정:** **② 로컬 중심**. 서버 동기화는 선택 기능.
- **근거:** 개인 무료 배포 → 서버 비용 부담 없고, 프라이버시가 차별화 메시지. 사용자는 "훔쳐가는 확장"을 경계함.
- **영향:** 설치 시 서버 계정 불필요. 전체 기능이 로컬에서 돌도록 아키텍처 구성.

## D-005 · 프롬프트 저장 단위
- **날짜:** 2026-04-20
- **컨텍스트:** 메시지 단위 vs 세션 단위 vs 혼합.
- **결정:** **혼합**. 시스템/템플릿 프롬프트 = 버전 관리 대상, 유저 턴 = usage 이벤트.
- **근거:** 섞어 저장하면 스코어링/A/B가 꼬인다. 템플릿은 재사용되므로 버전 필요, 유저 턴은 이벤트성.
- **영향:** SQLite 스키마에서 `prompts`(템플릿) vs `prompt_usages`(턴) 분리.

## D-006 · 품질 스코어 구성
- **날짜:** 2026-04-20
- **컨텍스트:** 룰베이스 vs LLM 심판 vs 실사용 메트릭의 가중치.
- **결정:** **룰 70% + 실사용 30%**. LLM 심판은 의심 케이스(예: 룰 스코어 < 60)에만 trigger.
- **근거:** 초기 LLM 비용 절감, 결정론적(설명 가능) 스코어 우선. LLM 심판은 애매한 케이스에만.
- **영향:** 룰셋 정의가 우선 작업. LLM 심판은 M6 이후.

## D-007 · 수익 모델
- **날짜:** 2026-04-20
- **결정:** **현재 논의 대상 아님 (무료)**.
- **근거:** 사용자 확보가 지금의 유일한 목표.
- **영향:** seat/플랜 설계 없음. 유료 기능 분기 없음.

---

## D-008 · 런타임 / 언어
- **날짜:** 2026-04-20
- **컨텍스트:** 에이전트·CLI·대시보드를 어떤 언어로 쓸지.
- **대안:** ① Node.js/TypeScript, ② Go, ③ Rust, ④ Python
- **결정:** **Node.js 20+ LTS / TypeScript**.
- **근거:** 설치 UX(`npm install -g`) 한 줄. Claude Code 에코시스템(SDK가 TS/Python)과 정합. Fastify·better-sqlite3 생태계 성숙. 단일 런타임으로 에이전트·CLI·대시보드·워커 모두 커버.
- **트레이드오프:** Go 단일 바이너리 배포의 깔끔함을 포기. 대신 npm 설치 경험이 개발자에게 더 친숙.

## D-009 · 패키지 매니저 / 빌드
- **결정:** **pnpm** + **tsup**(빌드) + **biome**(lint+format) + **vitest**(테스트)
- **근거:** pnpm이 디스크/속도 모두 우위. biome가 eslint+prettier를 한 번에 대체(빠름). tsup은 tsc보다 단순.

## D-010 · 로컬 저장소
- **결정:** **SQLite** via `better-sqlite3`. WAL 모드.
- **근거:** 단일 파일, 동시 읽기 허용(WAL), 의존성 없음. 로컬 중심 원칙과 완벽히 부합.

## D-011 · HTTP 에이전트 프레임워크
- **결정:** **Fastify**.
- **근거:** 150ms 훅 예산 확보 가능. JSON 스키마 검증 내장. 플러그인 생태계 성숙.

## D-012 · 대시보드 UI 스택
- **결정:** **서버 렌더링 HTML + Alpine.js + Tailwind(CDN)**. 번들러 없음.
- **근거:** 로컬 대시보드는 복잡할 필요 없음. 빌드 스텝 제거 → 설치 단순. React/Next는 과잉.

## D-013 · CLI 프레임워크
- **결정:** **commander.js** + **picocolors**(색) + **ora**(스피너)
- **근거:** 관용적·경량.

## D-014 · 로깅
- **결정:** **pino** (구조화 JSON 로그, 파일 로테이션은 수동)
- **근거:** Node 생태계 최속. 파싱 가능.

## D-015 · LLM SDK & 모델
- **결정:** **@anthropic-ai/sdk**. 심판/리라이터 기본 모델 = **claude-haiku-4-5**.
- **근거:** 가장 싼 Anthropic 모델. 키는 사용자가 제공(환경변수 `ANTHROPIC_API_KEY`). LLM 기능 전체는 기본 OFF, 설정에서 ON 시 동작.
- **트레이드오프:** OpenAI/Gemini는 MVP에서 제외. 이후 추가 가능하도록 어댑터 인터페이스로 설계.

## D-016 · PII 마스킹
- **결정:** **커스텀 정규식 룰셋** (이메일, 전화, 한국 주민번호, 카드번호, AWS/GCP 키, JWT, IP). 향후 presidio-like OSS로 확장.
- **근거:** MVP는 결정론적 정확도·속도가 중요. 탐지 실패 시 "의심 필드 플래그 + 유저 확인" 플로우 병행.

## D-017 · 데몬 관리
- **결정:** **detached child process + pidfile** (`~/.think-prompt/agent.pid`). launchd/systemd는 미사용.
- **근거:** OS별 분기 없이 통일. CLI가 `start/stop/status/restart` 제공. OS 부팅 자동 실행은 M8에서 선택 기능으로 추가.

## D-018 · 포트
- **결정:** 에이전트 `127.0.0.1:47823`, 대시보드 `127.0.0.1:47824`. 충돌 시 `+1`씩 탐색. 설정 파일 override 가능.
- **근거:** 47823은 임의 고정값(기억 용이). 충돌 방지 로직 필수.

## D-019 · 슬래시 커맨드 캡처
- **결정:** MVP에선 **생략**. Phase 2에서 `~/.claude/projects/**/history.jsonl` 파싱으로 보강.
- **근거:** 훅 payload에 없음. 우회에 복잡도 상승. 비용 대비 가치 낮음.

## D-020 · 훅 페이로드 열린 질문 처리
- **결정:** M0(Sprint 0)에서 **실측 스파이크**로 4개 열린 질문 전부 검증. 결과는 `docs/99-observation-log.md`에 append.
- **근거:** 문서상의 가정으로 구현하다 스펙이 어긋나면 롤백 비용 큼.

## D-021 · 실시간 코칭 UX 기본값
- **결정:** **조용히 기록(A)** 이 기본. 설정에서 "coach mode" 켜면 `additionalContext` 주입(B)로 전환.
- **근거:** 첫 인상에서 마찰 최소. 가치가 체감되면 사용자가 스스로 ON.

## D-022 · 배포 채널
- **결정:** **npm (global)** 단독으로 시작. `npm install -g @think-prompt/cli`. Homebrew 포뮬라는 이후.
- **근거:** Claude Code 사용자는 거의 전원 Node 있음. 첫 배포를 단순화.

## D-023 · 라이선스 / 리포지토리
- **결정:** **MIT** · **GitHub 공개 리포 단일**(monorepo pnpm workspaces).
- **근거:** 개인 무료 배포 정체성과 정합. Monorepo로 agent/cli/dashboard/shared 한 곳에서 관리.

## D-024 · 최소 지원 OS
- **결정:** **macOS (Apple Silicon + Intel) / Linux (x64/arm64)**. Windows는 Phase 2.
- **근거:** Claude Code 주 사용자 OS. Windows는 훅/데몬/경로 분기가 많아 비용 큼.

## D-025 · 릴리스 전략
- **결정:** **semantic versioning** + **Conventional Commits** + GitHub Actions로 npm publish.
- **근거:** 표준. 자동화 용이.

## D-026 · 자동 리라이트 전략
- **결정:** 메타 프롬프트 **단일 버전**으로 시작. 출력은 "개선 버전 1개 + 변경 이유". 유저가 accept/reject 버튼.
- **근거:** 여러 후보 생성은 비용·UX 복잡도 상승. 단일 강한 제안이 MVP에 적합.

## D-027 · 분석 배치 주기
- **결정:** 실시간(훅 직후 100ms 내 룰 분석) + **세션 종료 후 60초 지연 배치**(트랜스크립트 엔리치 + LLM 심판).
- **근거:** 유저가 대시보드를 열었을 때 데이터가 "거의 최신"이 되도록.

## D-028 · 오류 처리 원칙
- **결정:** **Fail-open**. 에이전트가 다운되거나 에러여도 Claude Code는 절대 막지 않는다.
- **근거:** 사용자 워크플로 방해 시 Think-Prompt 제거가 곧바로 따라온다. 데이터 누락 > 사용자 막힘.

## D-029 · 설정 파일 우선순위
- **결정:** `~/.think-prompt/config.json` > 환경변수 > 기본값. 사용자 수정 가능.
- **근거:** 설정은 여러 기기에서 동기화될 수 있도록 파일 기반. 환경변수는 임시 override.

## D-030 · 텔레메트리
- **결정:** **MVP 미포함**. 크래시/에러 리포트조차 수집하지 않음.
- **근거:** 로컬 중심 원칙의 결정적 근거. 이후 Opt-in 텔레메트리는 별도 설계로.

## D-031 · autostart 정책 (OS 레벨 자동 시작)
- **날짜:** 2026-04-22
- **컨텍스트:** `think-prompt autostart enable` 이 생성하는 launchd(macOS) / systemd --user(Linux) 유닛 파일의 5가지 세부 정책을 확정해야 한다. 이전 스캐폴딩 커밋(`6913612`)은 POLICY ZONE 주석으로 결정을 유예했었다.
- **대안:**
  - ① **always-on** — KeepAlive true / Restart=always. 항상 켜져 있게.
  - ② **crash-only** — KeepAlive.SuccessfulExit=false / Restart=on-failure. 정상 종료는 존중, 비정상 종료만 부활.
  - ③ **manual** — 부팅 시 자동 시작 없음. 유저가 명시적으로 load/start 해야 함.
- **결정:** **② crash-only** 를 채택. 구체 파라미터:
  1. 로그인 시 자동 실행: **YES** (`RunAtLoad=true` / `WantedBy=default.target`)
  2. 재시작 정책: **crash-only** (launchd `KeepAlive.SuccessfulExit=false`, systemd `Restart=on-failure`)
  3. 백오프: **10초** (`ThrottleInterval=10` / `RestartSec=10`)
  4. 로그: stdout + stderr 를 합쳐 `~/.think-prompt/autostart-<role>.log` 에 append (기존 `agent.log`/`worker.log` 와 충돌 회피)
  5. 작업 디렉토리 & 환경변수: cwd = `~/.think-prompt`, `PATH`는 시스템 기본 bin 경로 + macOS `/opt/homebrew/bin`, `NODE_ENV=production`
- **근거:**
  - **D-028(fail-open)과 정합.** 예기치 않은 크래시는 자동 복구하되, 유저가 `think-prompt stop` 하거나 `launchctl unload` 한 것은 **유저 의도**로 존중.
  - always-on은 버그로 프로세스가 즉시 죽는 경우 **restart storm** 위험(특히 launchd는 ThrottleInterval 없으면 1초 내 재시작). 10초 백오프로 방지.
  - manual은 편의성 손실이 커서 "auto-start" 기능의 목적을 해친다.
  - 로그를 별도 파일에 두는 이유: pino가 쓰는 구조화 JSON 로그와 OS 매니저가 캡처하는 stdout/stderr(시작 실패 시 주로 찍힘)를 섞으면 디버깅이 어려워짐.
- **영향:**
  - `packages/cli/src/commands/autostart.ts` 의 `buildLaunchdPlist` / `buildSystemdUnit` 두 함수에 정책을 구체화. export로 변경(테스트 목적).
  - `packages/cli/test/autostart.test.ts` 신규 — 유닛 파일 문자열에 대한 단언(Label/ProgramArguments/KeepAlive/ThrottleInterval/StandardOutPath/EnvironmentVariables 등).
  - `think-prompt autostart enable` 이 실제로 동작 가능한 상태가 됨. 이전까지는 POLICY ZONE throw 스텁이었음.
- **열린 항목:**
  - Windows 지원 시점에 동등한 Task Scheduler 정책을 어떻게 표현할지는 별도 결정으로(D-024 Phase 2에 종속).
  - autostart 로그 파일 로테이션: 현재 무제한 append. 90일 retention 정책(D-004 privacy 90일) 과 충돌 가능 — 추후 D-번호로 후속 검토.

## D-032 · 프로젝트 WHY 선언 — 유저의 두 가지 근본 문제
- **날짜:** 2026-04-22
- **컨텍스트:** D-002("수집+개선 둘 다 1급 기능")는 이 프로젝트가 **무엇을 하는가(WHAT)** 만 정의했고, **왜 유저가 이것을 필요로 하는가(WHY)** 는 어떤 문서에도 선언돼 있지 않았다. 카피·기능 스코핑·에이전트 지시의 최종 항소심 역할을 할 WHY 층이 필요.
- **결정:** Think-Prompt의 공격 대상은 유저의 **두 가지 근본 문제**다. 이후 모든 UX·카피·기능 판단의 1차 기준으로 삼는다.
  1. **인지 고착화 (Trust Fixation)** — AI 출력에 실망하는 경험이 몇 번 쌓이면 "AI는 원래 이 정도"라는 인식이 고착되고, 재시도·방법 연구를 멈춘다. 실력이 아니라 **시도가 멈춘 것**이 병목.
  2. **프롬프트 자각 부재 (Prompt Blindness)** — 같은 의도라도 표현 방식에 따라 결과가 크게 달라진다("아 다르고 어 다르다"). 유저는 **자기 프롬프트 품질 자체가 원인**임을 인식하지 못한 채 AI 탓을 한다.
- **근거:**
  - **데이터 비대칭.** 모델 성능(Anthropic/OpenAI/Google)에 대한 논의는 넘치지만 **입력 측 품질** 논의는 비어있다. 동일 모델에서도 입력이 달라지면 결과 분포가 크게 움직인다는 점을 유저가 자각하면 행동은 움직인다.
  - **자각 유도만으로 행동이 바뀐다.** 운동 앱이 심박수를 자동 기록해주는 것만으로 운동 습관이 바뀌는 선례처럼, **자기 프롬프트가 자동 기록·점수화되는 환경** 자체가 인지 고착을 깨는 가장 낮은 비용의 개입. "더 나은 프롬프트를 가르치는 것"보다 "자기 프롬프트를 보게 만드는 것"이 선행.
  - **대안(WHY 명시 안 하고 가기)의 비용.** WHY가 없으면 D-002의 "수집+개선"이 기능 리스트로만 작동한다. 신기능이 들어올 때마다 "이게 유저한테 왜 좋은가"가 매번 재논의되고, 카피 톤이 질책·코칭·계측 사이에서 흔들린다. WHY를 한 번 박으면 이후 판단이 단순해진다.
- **영향:**
  - **카피 톤 표준 (전 프로젝트 적용).** "질책·채점 톤" 금지, **"팩트 → 자각 → 1초 재시도 경로"** 의 3단 구조 채택. 참조 샘플(R001 케이스):
    - **Adopted:** `"출력 형태가 지정되지 않았습니다. 한 줄만 덧붙여도 답이 달라집니다. 예: 'JSON으로'."`
    - Rejected A (질책 톤): `"출력 형식을 지정하지 않아 -10점. 예: 'JSON으로 답해줘'를 추가하세요."`
    - Rejected B (감성 과잉): `"원하는 형태가 정해지지 않은 채로 전달됐어요..."` (개발자 타깃에 피로감)
  - **신기능 스코핑 1차 필터.** 제안된 기능이 두 근본 문제(고착 / 자각 부재) 중 하나 이상을 **직접** 누그러뜨리지 못하면 우선순위 하향. "있으면 좋은" 기능은 자동 P2 이하.
  - **룰 카피 전수 검토 대상.** `packages/rules` 의 R001~R012 설명 문구를 위 톤 표준으로 리라이팅 (후속 D-번호 또는 M-번호 작업).
  - **에이전트 호출 컨텍스트 주입.** UX·카피·문서 영향 있는 서브에이전트(planner / code-reviewer / docs-lead / frontend-developer 등) 호출 시 프롬프트 최상단에 WHY 리마인더 1블록 주입 (세부 문구는 운영 메모리가 보유, 후속 변경은 이 D-032 인용).
- **혼동 주의:**
  - `docs/proposal-draft.md` 의 "신뢰 이슈"는 _우리 수집 툴을 유저가 키로거로 의심하는_ 문제. 이 D-032가 말하는 신뢰는 _유저가 AI/자신에 대해 갖는 고착된 신뢰 상실_. 둘을 섞지 않는다.
- **관계:** D-002를 **대체(supersede)하지 않고 보완**. D-002는 WHAT, D-032는 WHY.

---

## 열린 결정(추후)
- 서버 동기화 API 설계 — Phase 2 (로컬 먼저 안정화 후)
- 팀 공유 포맷 — D-001 재검토 시점
- 윈도우 지원 방식 — M9 이후
- Cursor / VSCode 확장 — Phase 2

## D-033 · 심화 분석(deep analysis) 동의 정책
- **날짜:** 2026-04-22
- **컨텍스트:** 사용자가 `think-prompt rewrite` 보다 깊은 진단을 원할 때 — 문제 카테고리 · 단계별 개선 논리 · 심화 리라이트를 Anthropic LLM 에게 요청해서 로컬에 저장하고 싶다. 이 LLM 호출은 D-004(로컬 중심) 와 충돌하지 않지만, **D-015(LLM SDK) 보다 명시적인 동의 UX** 가 필요하다.
- **대안:**
  - ① **Settings 페이지 토글** — 한 번 켜면 이후 모든 심화 분석이 자동으로 동작
  - ② **첫 사용 시 모달 + "다시 묻지 않음"** — UI 관점에서 존중적, GDPR 친화
  - ③ **프롬프트마다 매번 묻기** — 너무 번거로움
- **결정:** **②** 기본 채택. 구체 구현:
  1. 신규 config 필드 `analysis.deep_consent: 'pending' | 'granted' | 'denied'` (기본 `'pending'`), `analysis.deep_consent_at: string | null` (타임스탬프).
  2. CLI: `think-prompt analyze <id>` 는 `deep_consent !== 'granted'` 이면 실행 전 설명 + `--grant-consent` / `--revoke-consent` 안내 후 exit 1.
  3. 대시보드: `'pending'` 상태일 때 prompt 상세 페이지 상단에 배너로 안내 + "허용 / 거부" 버튼. 허용하면 config 에 기록되고 배너는 사라진다.
  4. 출력 깊이: `{problems: [{category, severity, explanation}], reasoning: string[], after_text: string, applied_fixes: string[]}` — 현재 `rewrite` 에서 제공하는 `{after_text, reason, applied_fixes}` 대비 **problems** 와 **reasoning(단계별 논리)** 이 추가된 🅑 버전.
  5. LLM 에 전송되는 본문은 `pii_masked` 가 있을 때 그것을 우선 사용 (D-016 준수).
  6. 결과는 `deep_analyses` 테이블에 성공/실패 모두 기록 (audit trail).
- **근거:**
  - 첫 사용 모달 (🅑) 은 유저가 "무엇이 어떻게 전송되는지" 를 **딱 한 번** 보게 하면서, 그 이후로는 마찰 없이 기능을 쓸 수 있게 한다. 매번 묻기(③)는 실용적으로 사용 안 됨.
  - Settings 토글 (①) 은 GDPR 관점에서 "informed consent" 의 informed 부분이 약함 — 토글 자체에 "이게 뭔지" 가 안 드러남.
  - 출력 깊이 🅑 가 🅐(분류만) 대비 학습 가치가 훨씬 크고, 🅒(페르소나 추론) 대비 토큰 비용 통제 쉬움(~1500 tok/req).
  - `deep_analyses` 를 `rewrites` 와 분리한 이유: 스키마 진화를 독립적으로 하고, 역사적 rewrite 행의 형태 안정성을 보전하기 위함.
- **영향:**
  - `packages/core/src/config.ts` — `analysis` 섹션 신설
  - `packages/core/src/migrations/sql.ts` — MIGRATION_004 (`deep_analyses` 테이블)
  - `packages/core/src/analysis.ts` 신규 — `runDeepAnalysis`
  - `packages/core/src/db.ts` — `insertDeepAnalysis`, `getDeepAnalyses`
  - `packages/cli/src/commands/analyze.ts` 신규 — `think-prompt analyze`
  - 대시보드 detail 페이지 — consent banner + 분석 버튼 + 결과 패널
- **열린 항목:**
  - 배치 분석(TOP N 낮은 프롬프트 일괄 분석) — follow-up PR
  - 비용 상한 초과 시 유저 알림 UX — `llm.max_monthly_tokens` 이미 존재하지만 대시보드 노출은 아직 없음
  - 언젠가 OpenAI / Gemini 어댑터 추가 시 DEEP_SYSTEM 프롬프트의 provider-specific 튜닝 필요

---

## D-034 · npm 배포 구조: 단일 번들 + 스코프 방어 선점
- **날짜:** 2026-04-23
- **컨텍스트:** v0.1.0 을 npm 에 공개 배포할 시점. 모노레포는 7개 패키지(`cli / core / rules / agent / worker / dashboard / browser-extension`) 인데 이들 중 **어떤 단위로 npm 에 publish 할지** 결정 필요.
- **대안:**
  - ① `@think-prompt/*` 6개 패키지 모두 scoped publish — 표준 모노레포 배포. core/rules 를 라이브러리로 외부에 공개.
  - ② 단일 `think-prompt` 언스코프드 패키지로 **5개 워크스페이스 코드를 cli dist 에 번들** — CLI 도구 관례 (vercel, pm2, biome 패턴).
  - ③ 둘 다 publish (cli 는 thin re-export) — 유지 비용 가장 큼.
- **결정:** **②** 채택. 추가로 **`@think-prompt` organization 만 npm 에서 무료 claim** 해서 브랜드 스쿼팅 방지.
- **근거:**
  - **유저 미션과의 정렬.** D-032 두 근본 문제(인지 고착 / 프롬프트 자각 부재) 해결의 표면은 **CLI + 대시보드** 단 둘. core/rules 를 라이브러리로 노출해도 미션에 직접 기여 안 함.
  - **유지 비용.** ① 은 6 README · changesets · 6× 공개 API 계약 (Tier 1/2 내부 구조가 그대로 공개 표면이 됨) · 버전 sync 이슈. 1인 유지보수 기준 과함.
  - **유저 멘탈 모델.** "내가 체감하는 건 대시보드뿐" — 유저 직접 피드백(2026-04-22). 5개 데몬/배관은 구현 세부이고, npm 페이지에 6개를 노출하면 혼란만 가중.
  - **확장 가능성.** ② → ① 은 후행 추가 가능 (스코프만 잡혀있으면). ① → ② 는 이미 publish 된 패키지 deprecate · 이관 비용 발생. **회복 가능한 방향**으로 결정.
  - **이름 가용성.** `think-prompt` (언스코프드) · `@think-prompt/*` 모두 2026-04-23 기준 미선점 확인 (npm 404).
- **구현:**
  - `packages/cli/tsup.config.ts` — `noExternal: [/^@think-prompt\//]` 로 5개 워크스페이스 번들.
  - `packages/cli/package.json` — `name: "think-prompt"`, workspace deps 제거, transitive 외부 deps (`better-sqlite3`, `fastify`, `pino`, `zod`, `franc-min`, `commander`, `picocolors`) 직접 등록. `publishConfig.access: "public"`, `repository`, `license: "MIT"`, `keywords`, `homepage`, `bugs` 추가.
  - `packages/cli/{README.md, LICENSE}` — npm 페이지 표시용. 루트 README 의 핵심 섹션 추출.
  - 다른 5개 패키지(`@think-prompt/agent` 등) 는 `private: true` 로 모노레포 내부용으로만 유지.
  - 유저 액션: `npm login` → https://www.npmjs.com/org/create 에서 `think-prompt` org 무료 생성 → `npm publish` (단일 패키지).
- **영향:**
  - 엔드유저 설치: `npm i -g think-prompt` 한 줄.
  - 내부 리팩터(패키지 이름·구조 변경) 자유 — 공개 API 표면이 CLI 서브커맨드 출력 포맷뿐.
  - core/rules 를 라이브러리로 쓰고 싶은 외부 요청이 누적되면 D-035 로 ① 모드 추가 가능.
- **관계:** D-004(로컬 중심) · D-028(fail-open) · D-032(미션 정렬) 와 정합. D-001(로컬 우선) 의 npm 배포 표면을 구체화.

---

## D-036 · 룰 카탈로그(/rules) 를 유저 네비에서 숨김

- **Date:** 2026-04-23
- **Problem:** `/rules` 페이지는 R001~R018 카탈로그 메타 뷰로, D-032 미션(인지 고착·프롬프트 자각 해소)에 직접 기여하지 않는다. 유저가 자기 프롬프트를 돌아보는 흐름과 별개로 "내부 룰 목록"이 상단 네비에 상시 노출되면 주의 분산 + 설득력 하락.
- **Decision:** 상단 네비(`packages/dashboard/src/html.ts`의 `navItems`)에서 `['/rules', 'nav.rules']` 항목 제거. **라우트와 i18n 키는 유지** → README·이슈·차후 doctor 진단 카드에서 딥링크 `/rules?lang=ko` 로 접근 가능. 프롬프트 디테일(`/prompts/:id`) 페이지는 룰 히트 이름·설명을 인라인으로 이미 보여주므로 유저 가치 손실 없음.
- **Rationale:**
  - WHAT(18개 룰 목록) 이 아니라 WHY(내 프롬프트가 왜 약한가)가 유저가 필요한 정보.
  - 네비 항목 수 5 → 4 로 줄여 "개요·프롬프트·설정·진단" 동선 단순화.
  - 라우트 보존 → 회복 가능성 최대. 나중에 네비 복원하려면 `navItems` 한 줄만 추가.
- **Alternatives considered:**
  - ② 라우트 자체 삭제 → i18n 5개 언어 키(`nav.rules`·`rules.title` 등) 복원 비용 발생, 기여자가 "어떤 룰들이 있나" 알고 싶을 때 접근점 사라짐. 반려.
  - ③ `/doctor` 페이지 하위 카드로 카탈로그 이동 → 혼합 책임 늘어남. 당장 불필요.
- **Scope:** 네비 한 줄 삭제 + 기존 `/rules` 렌더는 무변. `nav.rules` i18n 키는 당분간 유휴(삭제 시 복원 비용 대비 가치 낮음).
- **관계:** D-032(미션 정렬) — "WHY에 기여하지 않는 서피스 축소" 기준.

---

## D-037 · 대시보드 브랜드 토큰 사이트와 통일 (ink · accent · font · 카드)

- **Date:** 2026-04-23
- **Problem:** 랜딩(`site/index.html`)과 로컬 대시보드가 같은 프로덕트인데 브랜드 신호가 달랐다. 사이트는 `accent: #6366f1` (indigo) + `ink: #0b0d12` 토큰을 쓰고, Inter cascade + mono 시그너처 라벨·accent 포커스 링·도트 로고로 정체성을 만들어 놓았는데, 대시보드는 Tailwind 기본 `blue-600` 과 일반 `rounded-lg shadow` 카드로 전혀 다른 얼굴이었음. D-032 미션("유저의 두 근본 문제 해결")을 위해서도 마케팅→대시보드 전환 시 같은 제품을 쓰고 있다는 즉각적 신호가 중요.
- **Decision:** 대시보드 `layout()` 의 `tailwind.config.extend` 에 사이트와 동일한 `ink`·`accent`·`fontFamily` 토큰을 추가하고, 전체 UI 에서 다음을 일괄 스왑.
  - `blue-600/700` 계열 → `accent`, `accent/90` 호버
  - 카드 컨테이너 `rounded-lg shadow` → `rounded-xl border border-gray-200 dark:border-zinc-700 shadow-sm` (사이트처럼 가벼운 그림자 + 은은한 테두리)
  - `<style>` 블록에 `:focus-visible` accent 링 + `font-feature-settings: "ss01", "cv11"` + antialiased 정렬
  - 로고 앞에 `w-2 h-2 rounded-full bg-accent` 도트
  - deep analysis 강조 카드의 좌측 4px 컬러바를 `border-purple-500` → `border-l-accent`
- **Rationale:**
  - 최소 변경으로 최대 체감 일치 — 색과 폰트만 통일해도 "같은 제품" 인상의 80%.
  - 대시보드 고유성(데이터 밀도, `max-w-6xl`, 작은 h1/h2, 다크모드)은 **의도적으로 보존** — 마케팅과 데이터 UI 는 목적이 달라 타이포 리듬까지 일치시키면 화면이 비효율적.
  - 기본 그림자 → 가벼운 테두리 전환은 "정돈된 작업대" 톤을 유지하면서 사이트의 flat + subtle 감각과 정합.
- **Alternatives considered:**
  - ② 사이트 레이아웃까지 그대로 복제(`max-w-5xl`, 5xl 히어로 H1 등) — 데이터 밀도 손해, 반려.
  - ③ 다크 모드용 별도 `ink-dark`/`accent-dark` 토큰 분화 — indigo-500 이 다크 배경에서도 충분한 대비를 가지므로 지금은 과잉.
- **Scope:** `packages/dashboard/src/html.ts`·`server.ts` 색상·폰트·카드 · 테스트 정규식 업데이트 · 신규 회귀 테스트 5건. `packages/browser-extension` 은 스코프 외(별 건).
- **관계:** D-012(번들러 없음) — Tailwind CDN 그대로 사용 · D-032(미션 정렬) — 동일 브랜드 신호가 유저의 "이 도구가 나를 위한 것" 인식 강화.

---

## 취소된 결정
*(없음 — 새 결정이 기존 것을 번복할 때 여기에 기록)*
