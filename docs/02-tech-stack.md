# 02 · 기술 스택

> D-008 ~ D-025 에서 확정된 기술 선택을 한 곳에 정리.
> 이유는 `00-decision-log.md`에.

---

## 런타임 / 언어
- **Node.js 20 LTS 이상** (Iron 이상. 22까지 테스트 타겟).
- **TypeScript 5.x** (strict + exactOptionalPropertyTypes).

## 레포 구조
- **Monorepo (pnpm workspaces)** · 단일 Git 공개 리포.
- 패키지:
  - `packages/cli` — 진입점, 서브커맨드(`install/uninstall/start/stop/status/doctor/list/show/rewrite`)
  - `packages/agent` — 로컬 HTTP 훅 수신기(Fastify)
  - `packages/worker` — 비동기 큐 소비자(트랜스크립트 파싱 · LLM 심판)
  - `packages/dashboard` — 로컬 대시보드(서버 렌더 HTML)
  - `packages/core` — 공통 코드(DB, 룰 엔진, PII, 스키마)
  - `packages/rules` — 안티패턴 룰 정의 (외부에서 import 가능)

## 빌드 · 품질 · 테스트
| 역할 | 도구 |
|---|---|
| 빌드 | **tsup** (ESM + CJS 듀얼, declaration) |
| 린트/포맷 | **biome** (eslint+prettier 통합) |
| 테스트 | **vitest** (유닛 + 통합) |
| e2e | **node:test** + 실제 Claude Code 훅 스크립트 |
| 타입체크 | `tsc --noEmit`을 CI에서 |

## 서버/데이터
| 역할 | 도구 |
|---|---|
| HTTP(에이전트·대시보드) | **Fastify v5** |
| DB | **better-sqlite3** (WAL mode) |
| 큐(비동기) | **파일 기반 JSONL** (`~/.pro-prompt/queue.jsonl`, watcher) — 외부 의존 없음 |
| 로그 | **pino** + `pino-pretty`(로컬 tail) |
| 스키마 검증 | **zod** |

## CLI
- **commander.js** (서브커맨드)
- **picocolors** (색)
- **ora** (스피너)
- **prompts** (인터랙티브 설치)

## LLM
- **@anthropic-ai/sdk** 공식 Node SDK
- 기본 모델: `claude-haiku-4-5` (저가), 승격 시 `claude-sonnet-4-6`
- 어댑터 인터페이스로 OpenAI/Gemini 확장 가능하게 설계 (MVP에선 Anthropic만)
- **Prompt caching**: 리라이터/심판 시스템 프롬프트는 `cache_control: ephemeral`로 5분 TTL 캐시 활용

## 대시보드(로컬)
- **서버 렌더 HTML** (Fastify + `@fastify/view` + eta or ejs; 최종: **eta**)
- **Alpine.js** (인터랙션) — CDN 로드, 번들 없음
- **Tailwind** — CDN play build (dev 단계) → 이후 로컬 prebuild
- **htmx** — 부분 갱신. 번들 없음

## 배포
- `npm publish` (public) — `@pro-prompt/*` 스코프
- **GitHub Actions** 워크플로: PR 테스트 → tag → publish
- **Conventional Commits** 기반 changelog 자동화(`changesets`)
- 라이선스: **MIT**
- **최소 지원 OS**: macOS(Apple Silicon + Intel), Linux(x64/arm64). Windows는 Phase 2.

## 설정 파일 경로
| 경로 | 용도 |
|---|---|
| `~/.pro-prompt/config.json` | 유저 전역 설정 |
| `~/.pro-prompt/prompts.db` | 프롬프트/이벤트 저장 |
| `~/.pro-prompt/queue.jsonl` | 워커 큐 (append-only) |
| `~/.pro-prompt/agent.pid` | 에이전트 PID |
| `~/.pro-prompt/worker.pid` | 워커 PID |
| `~/.pro-prompt/agent.log`, `worker.log` | 로그 파일 (7일 로테이션) |
| `~/.claude/settings.json` | Claude Code 설정(훅 블록 병합 대상) |

## 포트 (D-018)
| 포트 | 역할 |
|---|---|
| 47823 | Agent (훅 수신) |
| 47824 | Dashboard |

충돌 시 `+1`씩 최대 10회 시도. `config.json`에서 고정 가능.

## 버전 · 릴리스
- **SemVer 2.0** · **Conventional Commits**.
- v0.x 동안 **파괴적 변경 허용**, v1.0 이후 호환성 보증.
- 첫 공개 릴리스 목표: **v0.1.0**.
