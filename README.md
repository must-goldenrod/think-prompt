# Pro-Prompt

Claude Code 프롬프트를 **로컬에서** 수집·진단·코칭하는 개인 개발자용 무료 툴.

> 원문은 유저 PC 밖으로 나가지 않습니다. 서버 동기화 없이 혼자 쓸 수 있습니다.

## 빠른 시작

```bash
# Node 20 LTS 이상 필요
npm install -g @pro-prompt/cli

pro-prompt install          # 훅 설치 + 데몬 기동
pro-prompt open             # 로컬 대시보드 (http://127.0.0.1:47824)
pro-prompt doctor           # 상태 점검

# Claude Code를 평소대로 사용
claude
```

**제거:** `pro-prompt wipe` — 훅 블록 제거 + 모든 로컬 데이터 삭제.

## 무엇을 해주나?

- Claude Code에서 입력하는 **프롬프트를 로컬 SQLite에 수집**.
- 룰 엔진이 **안티패턴 감지** (모호, 컨텍스트 부족, 출력 포맷 미지정 등 12종).
- **품질 스코어** 산출 → 낮은 점수 프롬프트에 **1클릭 리라이트** 제안(Opt-in LLM).
- 대시보드로 **추이 확인** + 세션/서브에이전트 호출 타임라인.

## 프라이버시

- **로컬 전용** 이 기본. 서버 전송 없음.
- PII 마스킹 파이프라인(이메일·전화·주민번호·카드·API 키 등).
- 완전 삭제: `pro-prompt wipe`.
- 자세한 설계: [docs/00-decision-log.md](./docs/00-decision-log.md) D-004/D-030.

## 문서

- [`docs/README.md`](./docs/README.md) — 설계·기획 문서 인덱스.
- [`docs/07-build-and-test-plan.md`](./docs/07-build-and-test-plan.md) — 개발 로드맵과 유저 테스트 절차.

## 라이선스

MIT.
