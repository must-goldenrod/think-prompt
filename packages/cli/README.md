# think-prompt

> Claude Code에 **프롬프트 개인 코치**를 붙여주는 로컬-전용 오픈소스 도구.

[![npm version](https://img.shields.io/npm/v/think-prompt.svg)](https://www.npmjs.com/package/think-prompt)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-must--goldenrod%2Fthink--prompt-181717?logo=github)](https://github.com/must-goldenrod/think-prompt)

---

## 한 줄 요약

여러분이 Claude Code에 **어떤 프롬프트를 어떻게 치는지** 로컬에 기록하고,
**어디가 부족한지 조용히 알려주는** 무료 도구. **내 컴퓨터 밖으로 데이터가 나가지 않습니다.**

---

## 🚀 30초 설치

```bash
# Node 20+ 필요
npm i -g think-prompt
think-prompt install        # 훅 + 데몬 자동 설정
# Claude Code를 평소대로 쓰고
think-prompt open           # 대시보드 오픈 (http://127.0.0.1:47824)
```

처음이라면 → **[📘 완전 입문 가이드](https://github.com/must-goldenrod/think-prompt/blob/main/docs/GUIDE.md)**

---

## ✨ 뭘 해주나요?

1. **자동 수집** — Claude Code 훅으로 모든 프롬프트·세션·서브에이전트 호출을 로컬 SQLite에 저장
2. **품질 진단** — 12개 안티패턴 룰(R001~R012)로 0–100점 자동 채점
3. **자동 리라이트(선택)** — Anthropic API 키 있으면 낮은 점수 프롬프트를 더 나은 버전으로 다시 씁니다
4. **로컬 대시보드** — `http://127.0.0.1:47824` — tier 분포·TOP 5 낮은 점수·세션 타임라인
5. **인라인 코칭(선택)** — 모호한 프롬프트에 Claude가 답하기 전에 "확인 질문부터" 안내

---

## 🔒 프라이버시 약속

- **원문 프롬프트는 여러분 PC 밖으로 나가지 않습니다.**
- 서버 동기화 모드 없음 (v0.1 기준)
- LLM 기능을 켰을 때만 마스킹된 사본이 Anthropic에 갑니다 — 이미 Claude Code가 하는 일과 같은 범위
- PII(이메일·전화·API 키·JWT 등)는 저장 전 자동 마스킹
- `think-prompt wipe --yes` 한 줄로 **모든 데이터 + 훅 완전 제거**

---

## 🧰 주요 명령어

```bash
think-prompt install         # 훅 + 데몬 설치
think-prompt uninstall       # 제거 (데이터 유지, --purge 로 완전 삭제)
think-prompt start/stop/restart
think-prompt status          # 데몬 3개 상태
think-prompt doctor          # 건강 진단

think-prompt list [--tier bad] [--rule R003] [--limit 20]
think-prompt show <id>       # 프롬프트 상세 + 룰 히트 + 점수

think-prompt open            # 대시보드 브라우저 오픈
think-prompt wipe --yes      # 완전 삭제
```

전체 18개 명령어와 옵션은 `think-prompt --help` 참조.

---

## 📦 시스템 요구사항

- **Node.js 20+** (22 권장)
- **macOS · Linux** — Windows는 Phase 2
- **Claude Code CLI** 설치 필요 (훅 등록 대상)

---

## 🔗 관련 링크

- **GitHub:** https://github.com/must-goldenrod/think-prompt
- **이슈/제안:** https://github.com/must-goldenrod/think-prompt/issues
- **설계 문서:** [docs/](https://github.com/must-goldenrod/think-prompt/tree/main/docs)
- **결정 로그(D-번호):** [docs/00-decision-log.md](https://github.com/must-goldenrod/think-prompt/blob/main/docs/00-decision-log.md)

---

## 📜 라이선스

MIT — 자유롭게 쓰세요.
