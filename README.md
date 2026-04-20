# Think-Prompt

> Claude Code에 **프롬프트 개인 코치**를 붙여주는 로컬-전용 오픈소스 도구.

[![CI](https://github.com/must-goldenrod/think-prompt/actions/workflows/ci.yml/badge.svg)](https://github.com/must-goldenrod/think-prompt/actions)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Release](https://img.shields.io/github/v/release/must-goldenrod/think-prompt)](https://github.com/must-goldenrod/think-prompt/releases)

---

## 한 줄 요약

여러분이 Claude Code에 **어떤 프롬프트를 어떻게 치는지** 로컬에 기록하고,
**어디가 부족한지 조용히 알려주는** 무료 도구. 내 컴퓨터 밖으로 데이터가 나가지 않습니다.

---

## 🎯 이게 왜 필요한가요?

- "내가 짧게 대충 치면 Claude가 잘 못 답한다"는 걸 **숫자로** 확인하고 싶다.
- 매번 **출력 형식 지정을 깜빡**한다. 누가 옆에서 리마인드해줬으면.
- 지난주 내 프롬프트들 중 **뭐가 제일 구렸는지** 객관적으로 보고 싶다.
- **프라이버시 걱정 없이** 프롬프트 로깅 도구를 쓰고 싶다.

---

## 🚀 30초 맛보기

```bash
# Node 20+ 필요
git clone https://github.com/must-goldenrod/think-prompt.git
cd think-prompt
pnpm install && pnpm -r build
node packages/cli/dist/index.js install
# Claude Code를 평소대로 쓰고
node packages/cli/dist/index.js open    # 대시보드 오픈
```

> 처음 써보시면 **[📘 완전 입문 가이드](./docs/GUIDE.md)** 부터. 터미널이 낯설어도 따라오실 수 있게 썼어요.

---

## ✨ 뭘 해주나요?

### 1. 자동 수집
Claude Code 훅으로 여러분이 친 모든 프롬프트·세션·서브에이전트 호출을 로컬 SQLite에 저장.

### 2. 품질 진단
12개 안티패턴 룰로 0-100점 자동 채점.
- R001 너무 짧음 · R002 출력 형식 미지정 · R003 맥락 없음
- R004 한 프롬프트에 여러 태스크 · R005 프롬프트 인젝션 의심
- ... (대시보드 `/rules` 에서 전체 목록)

### 3. 자동 리라이트 (선택)
Anthropic API 키 있으면 낮은 점수 프롬프트를 Claude Haiku가 더 나은 버전으로 다시 씁니다. 원문은 여러분 PC에만, 리라이트 요청 시에만 마스킹본이 Anthropic에 갑니다.

### 4. 로컬 대시보드
`http://127.0.0.1:47824` — tier 분포, TOP 5 낮은 점수, 세션 타임라인, 룰 카탈로그.

### 5. 인라인 코칭 (선택, 기본 OFF)
`coach mode` ON 시 모호한 프롬프트에 Claude가 답하기 전에 **"확인 질문부터"** 하게 안내.

---

## 🔒 프라이버시 약속

- **원문 프롬프트는 여러분 PC 밖으로 나가지 않습니다.** (`D-004` 확정 결정)
- 서버로 보내는 모드 없음 (v0.1 기준).
- LLM 기능을 켰을 때만 마스킹된 사본이 Anthropic에 감 — Claude Code 자체가 이미 하는 일과 동일 범위.
- PII (이메일·전화·주민번호·API 키·JWT 등)는 저장 전 자동 마스킹.
- `think-prompt wipe --yes` 한 줄로 **모든 데이터 + 훅 완전 제거**.

자세한 설계: [`docs/00-decision-log.md`](./docs/00-decision-log.md)

---

## 🧰 CLI 명령어 (18개)

```bash
think-prompt install         # 훅 + 데몬 설치
think-prompt uninstall       # 제거 (데이터 유지, --purge 로 완전 삭제)
think-prompt start/stop/restart   # 데몬 제어
think-prompt status          # 3개 데몬 상태
think-prompt doctor          # 건강 진단 (훅 · 데몬 · DB · 로그)

think-prompt list [--tier bad] [--rule R003] [--limit 20]
think-prompt show <id>       # 프롬프트 상세 + 룰 히트 + 점수
think-prompt rewrite <id> [--copy]   # LLM 리라이트 제안

think-prompt coach on|off    # 인라인 코칭 토글
think-prompt config get/set/list
think-prompt reprocess [--all|--session <id>]

think-prompt export --since 30d --out file.json
think-prompt open            # 대시보드 브라우저 오픈
think-prompt wipe --yes      # 완전 삭제
```

---

## 📁 프로젝트 구조

```
think-prompt/                        ← 리포 루트
├── README.md                        ← 이 문서
├── LICENSE                          ← MIT
├── CHANGELOG.md                     ← 릴리스 노트
├── CONTRIBUTING.md                  ← 기여 가이드
├── docs/                            ← 설계 + 사용 문서
│   ├── GUIDE.md                     ← 🌟 완전 입문 가이드
│   ├── 00-decision-log.md           ← 모든 확정 결정(D-001..)
│   ├── 01-hook-design.md            ← Claude Code 훅 설계
│   ├── 02-tech-stack.md             ← 기술 스택
│   ├── 03-local-storage.md          ← SQLite 스키마
│   ├── 04-transcript-parser.md
│   ├── 05-quality-engine.md         ← 룰 + 스코어 공식
│   ├── 06-coaching-ux.md
│   └── 07-build-and-test-plan.md    ← 마일스톤별 테스트 가이드
└── packages/                        ← pnpm 워크스페이스 (6개)
    ├── core/                        ← DB, 설정, 로거, PII, 스코어러
    ├── rules/                       ← 안티패턴 룰 R001..R012
    ├── agent/                       ← Fastify 훅 수신기 (:47823)
    ├── worker/                      ← 백그라운드 작업 처리
    ├── dashboard/                   ← 로컬 웹 UI (:47824)
    └── cli/                         ← think-prompt 바이너리
```

---

## 📚 문서 지도

| 상황 | 가세요 |
|---|---|
| 처음 써봐요 | [`docs/GUIDE.md`](./docs/GUIDE.md) — 초보자용 완전 가이드 |
| 왜 이렇게 설계했는지 궁금 | [`docs/00-decision-log.md`](./docs/00-decision-log.md) |
| 코드 기여할래요 | [`CONTRIBUTING.md`](./CONTRIBUTING.md) |
| 뭐가 바뀌었나요 | [`CHANGELOG.md`](./CHANGELOG.md) |
| 빌드·테스트 방법 | [`docs/07-build-and-test-plan.md`](./docs/07-build-and-test-plan.md) |
| 룰 추가하고 싶어요 | [`docs/05-quality-engine.md`](./docs/05-quality-engine.md) |

---

## 🛠 개발

```bash
pnpm install           # 의존성
pnpm -r build          # 전체 빌드
pnpm typecheck         # 타입체크
pnpm test              # 53개 테스트
pnpm lint              # biome
pnpm run ci            # 위 전부 순차 실행
```

CI는 Ubuntu + macOS × Node 20/22 매트릭스. Windows는 Phase 2.

---

## 🗺️ 로드맵

- **v0.1.x** — 버그 수정, 룰 튜닝, M0 실측 확정
- **v0.2** — Cursor/VSCode 확장, 서버 동기화 (Opt-in)
- **v0.3** — 팀 공유, 리뷰 워크플로
- **v1.0** — Windows 지원, API 안정성 보증

진행 중 이슈: https://github.com/must-goldenrod/think-prompt/issues

---

## 📝 라이선스

MIT. 자유롭게 쓰고 고치세요. PR 환영.

---

## 🙏 기여자

Made with ❤️ for the Claude Code community.
