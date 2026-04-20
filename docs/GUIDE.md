# Think-Prompt 완전 입문 가이드

> **누구를 위한 글인가요?**
> - Claude Code를 쓰고 있고, 프롬프트를 더 잘 쓰고 싶은 분
> - 터미널 명령어가 좀 낯설어도 괜찮아요. 복붙해서 하나씩 따라 하면 됩니다.
> - 중간에 안 되는 게 있으면 **§6 "뭔가 이상해요"** 먼저 보세요.

---

## 📖 목차

1. [Think-Prompt가 뭔가요?](#1-think-prompt가-뭔가요)
2. [설치 전 준비물](#2-설치-전-준비물-5분)
3. [처음 설치하기](#3-처음-설치하기-10분)
4. [제대로 설치됐는지 확인](#4-제대로-설치됐는지-확인)
5. [매일 쓰는 법](#5-매일-쓰는-법)
6. [뭔가 이상해요 (트러블슈팅)](#6-뭔가-이상해요-트러블슈팅)
7. [고급 기능](#7-고급-기능)
8. [제거하기](#8-제거하기)
9. [자주 묻는 질문 (FAQ)](#9-자주-묻는-질문-faq)

---

## 1. Think-Prompt가 뭔가요?

Claude Code에 **"프롬프트 개인 코치"** 를 붙인다고 생각하시면 돼요.

### 비유로 이해하기

운동 앱이 자동으로 심박수 · 걸음 수를 기록하고, 주말에 "이번 주는 좀 적네요" 알려주는 것처럼 — Think-Prompt는 여러분이 Claude Code에 **치는 프롬프트를 자동으로 기록**하고, **어디가 부족한지 조용히 알려줍니다.**

### 구체적으로 뭘 하나요?

1. **자동 수집** — Claude Code에 입력한 모든 프롬프트가 여러분 컴퓨터의 로컬 파일(`~/.think-prompt/prompts.db`)에 저장돼요.
2. **자동 채점** — 12가지 안티패턴 룰로 프롬프트를 검사해 0-100점을 매깁니다. 예: "출력 형식을 안 정해서 -10점"
3. **개선안 제시** — (선택) Claude API 키를 주면 낮은 점수 프롬프트를 LLM이 더 나은 버전으로 리라이트해줘요.
4. **대시보드** — `http://127.0.0.1:47824` 에 로컬 웹 페이지가 열립니다. 지난주 통계 · 점수 낮은 프롬프트 TOP 5 등.

### 제일 중요한 것 3가지

- **🔒 프라이버시:** 모든 데이터는 **여러분 컴퓨터 밖으로 나가지 않아요.** 서버 전송 없음. (Claude API를 쓸 때만 해당 프롬프트가 Anthropic에 가는데, 이건 Claude Code 자체가 이미 하는 일이죠.)
- **🛡️ 안전성:** Think-Prompt에 문제가 생겨도 **Claude Code는 절대 멈추지 않아요** (fail-open 원칙). 최악의 경우 그냥 기록이 안 될 뿐.
- **💰 무료:** 돈 안 받아요. 광고 없어요. 계정 만들 필요 없어요.

---

## 2. 설치 전 준비물 (5분)

### 2.1 운영체제 확인

**macOS** 또는 **Linux** 여야 해요. Windows는 아직 지원 안 됩니다.
```bash
uname -s
# 결과가 Darwin = macOS, Linux = Linux. 그 외면 지원 안 됨.
```

### 2.2 Node.js 20 이상 설치 확인

터미널을 열어요:
- **macOS:** `Cmd + Space` → "터미널" 검색 → 엔터
- **Linux:** Ctrl+Alt+T 같은 단축키

그리고:
```bash
node --version
```

**결과에 따라:**

- `v20.x.x` 또는 `v22.x.x` → ✅ 좋아요, 넘어가세요.
- `v18.x.x` 이하 → Node 업그레이드 필요 (아래 참고).
- `command not found: node` → Node 설치 필요 (아래 참고).

### 2.3 Node 설치 (이미 있으면 건너뛰기)

가장 쉬운 방법 3가지 중 하나:

**방법 A — Homebrew (macOS 추천)**
```bash
# Homebrew 있는지 먼저 확인
brew --version
# 없으면: /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

brew install node@22
# 그 다음:
node --version
```

**방법 B — nvm (원래 Node 개발자면 익숙)**
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# 터미널 재시작 후:
nvm install 22
nvm use 22
```

**방법 C — 공식 설치 프로그램**
- https://nodejs.org 가서 LTS 버전(22.x 또는 20.x) 다운로드 → 설치 파일 실행.

### 2.4 pnpm 설치

pnpm은 Node용 패키지 관리자예요. npm보다 빠르고 효율적이라 이 프로젝트에서 씁니다.

```bash
# 이미 Node가 있으면:
corepack enable
corepack prepare pnpm@10 --activate
pnpm --version   # 10.x.x 이상 나와야 함
```

잘 안 되면:
```bash
npm install -g pnpm
pnpm --version
```

### 2.5 Git 설치 확인

```bash
git --version
```
- 버전이 나오면 ✅
- 아니면: macOS에서 `xcode-select --install` 하거나 Linux에서 `sudo apt install git`

### 2.6 Claude Code 설치 확인

Think-Prompt는 Claude Code를 위한 도구라 Claude Code가 있어야 써먹을 수 있어요.
```bash
claude --version
```
없으면 [Claude Code 공식 설치](https://docs.claude.com/en/docs/agents-and-tools/claude-code/overview) 참고.

### ✅ 체크리스트 (다음으로 넘어가기 전에)

- [ ] `node --version` → v20 이상
- [ ] `pnpm --version` → v10 이상
- [ ] `git --version` → 버전 나옴
- [ ] `claude --version` → 버전 나옴

하나라도 ❌ 면 위로 돌아가서 채우세요. 다 됐으면 계속.

---

## 3. 처음 설치하기 (10분)

> 현재 Think-Prompt는 **npm에 아직 배포 전** 이라 **소스코드로 설치**해야 해요. 이슈 #8에서 추적 중.

### 3.1 리포 받기

어디 놓을지 마음에 드는 폴더로 가세요:
```bash
cd ~          # 홈 폴더로
mkdir -p projects && cd projects
git clone https://github.com/must-goldenrod/think-prompt.git
cd think-prompt
```

지금 자기 위치 확인:
```bash
pwd
# /Users/당신이름/projects/think-prompt 같은 게 나와야 함
```

### 3.2 의존성 설치

```bash
pnpm install
```

**뭐가 일어나요?** 약 200MB 정도의 Node 패키지들을 다운받고 `node_modules/` 에 풀어요. 1-2분 걸립니다. 네트워크가 느리면 더.

**기대 출력:**
```
Packages: +173
...
Done in 12s using pnpm v10.32.1
```

⚠️ **주의:** 처음엔 `Ignored build scripts` 라는 경고가 나올 수 있어요. 무시하고 다음 단계 진행하면 자동 해결됩니다.

### 3.3 빌드

```bash
pnpm -r build
```

**뭐가 일어나요?** TypeScript 소스를 JavaScript로 컴파일해 각 패키지의 `dist/` 폴더에 넣어요. 30초 정도.

**기대 출력:**
```
packages/core build: Done
packages/rules build: Done
packages/agent build: Done
packages/worker build: Done
packages/dashboard build: Done
packages/cli build: Done
```

한 줄이라도 `Failed` 가 나오면 §6.1 트러블슈팅으로.

### 3.4 Claude Code에 훅 설치

이제 진짜 설치예요:

```bash
node packages/cli/dist/index.js install
```

**뭐가 일어나요?**
1. `~/.think-prompt/` 폴더 생성 (데이터 저장소)
2. SQLite 데이터베이스 초기화
3. `~/.claude/settings.json` 에 Think-Prompt 훅 6개 추가 (기존 설정은 자동 백업 후 보존)
4. 3개 데몬(agent · worker · dashboard) 백그라운드 실행

**기대 출력:**
```
✓ Claude settings updated: /Users/당신이름/.claude/settings.json
  (backup: /Users/당신이름/.claude/settings.json.bak-1745...)
✓ agent running (pid 12345, :47823)
✓ worker running (pid 12346)
✓ dashboard running (pid 12347, :47824)

Next: open Claude Code, type anything, then run think-prompt list
```

📌 **선택 — 매번 `node packages/cli/dist/index.js` 치기 귀찮으면** `think-prompt` 명령으로 단축:

```bash
npm link --workspace packages/cli
# 확인
think-prompt --version
# 0.1.0 나오면 성공
```

아래부터는 **`think-prompt`** 로 쓸게요. `npm link` 안 하셨으면 `node packages/cli/dist/index.js`로 치환해서 읽으면 돼요.

---

## 4. 제대로 설치됐는지 확인

### 4.1 건강검진 (Doctor)

```bash
think-prompt doctor
```

**기대 출력 (좋은 상태):**
```
Think-Prompt Doctor
─────────────────
✓ hooks installed in /Users/당신이름/.claude/settings.json
✓ agent running (pid 12345, :47823)
✓ worker running (pid 12346)
✓ database schema_version=1
⚠ no prompt_usages yet — open Claude Code and type something
⊘ LLM disabled (judge & rewrite skipped)
```

각 줄의 뜻:
- `✓ hooks installed` — Claude Code 설정에 훅이 들어갔다
- `✓ agent/worker running` — 백그라운드 서비스가 살아 있다
- `✓ database schema_version=1` — 데이터베이스 정상
- `⚠ no prompt_usages yet` — 아직 프롬프트가 하나도 없음 (곧 고쳐요)
- `⊘ LLM disabled` — Claude API 심판/리라이터 기능은 꺼짐 (선택, §7에서 켜는 법)

### 4.2 첫 프롬프트 만들어보기

새 터미널 창을 열어 Claude Code를 실행:
```bash
claude
```

뭐든 물어보세요:
```
> Hello, can you help me?
```

Claude가 답하고 나면 **그 터미널을 닫지 말고** 다른 터미널에서:
```bash
think-prompt list
```

**기대 출력:**
```
7KMQAZ9V   50 weak  hits:2  Hello, can you help me?
```

🎉 **성공!** 방금 여러분이 친 프롬프트가 기록된 거예요.

각 항목 뜻:
- `7KMQAZ9V` — 프롬프트 ID (끝 8자리)
- `50` — 품질 점수 (0-100)
- `weak` — 티어 (good/ok/weak/bad)
- `hits:2` — 몇 개 룰에 걸렸나
- `Hello, can you help me?` — 프롬프트 앞부분

### 4.3 대시보드 열어보기

```bash
think-prompt open
```

브라우저에 http://127.0.0.1:47824 가 열려요. 못 열렸으면 주소 직접 붙여넣기.

보이는 것:
- **Overview** — 총 프롬프트 수 · tier 분포 · 낮은 점수 TOP 5
- **Prompts** — 전체 목록 (필터 가능)
- **Rules** — 12가지 안티패턴 룰 설명
- **Settings** — 현재 설정 확인
- **Doctor** — 위 `doctor` 명령과 같은 정보

프롬프트 하나 클릭해보면:
- 원문
- 점수 breakdown (룰 점수 · 사용 점수 · LLM 점수)
- 걸린 룰 목록
- (LLM 켜져 있으면) 리라이트 제안

### 4.4 상세 보기

```bash
think-prompt show 7KMQAZ9V
```

(위 `list` 에서 본 ID 8자리만 써도 돼요)

출력:
```
Prompt 01HZ...7KMQAZ9V
  session: session-123
  created: 2026-04-20T16:45:00Z
  length:  23 chars, 5 words, turn 0

─── original ───
Hello, can you help me?

score: rule=70 usage=- judge=- final=70 tier=ok

rule hits:
  - R002 sev=3: 출력 형식이 지정되지 않았습니다. JSON/bullet/길이 등을 명시하면 결과가 일관됩니다.
  - R003 sev=3: 대상 도메인·프로젝트 맥락이 빠졌습니다.
```

이제 여러분이 **왜 50점인지** 구체적으로 알게 됐어요. "도메인 맥락이 없네, 출력 형식도 안 정했네" 하고.

---

## 5. 매일 쓰는 법

### 5.1 평소엔 그냥 Claude Code 쓰기만 해도 돼요

Think-Prompt는 백그라운드에서 알아서 작동해요. 특별히 뭘 할 필요 없음.

### 5.2 가끔 들여다보기 — 3가지 일상 루틴

**🌅 하루 시작할 때 (10초)**
```bash
think-prompt doctor
```
✓ 가 다 떠 있으면 정상 작동 중.

**☕️ 커피 마시면서 (1분)**
```bash
think-prompt list --tier bad --limit 10
think-prompt list --tier weak --limit 10
```
"오늘 내 프롬프트 중 엉망인 거 뭐 있었지?" 확인.

**📊 금요일 회고 (5분)**
```bash
think-prompt open   # 대시보드 오픈
```
- Overview에서 tier 분포 확인 — good:ok:weak:bad 비율이 지난주보다 나아졌나?
- "낮은 점수 TOP 5" 훑어보기
- 자주 걸리는 룰 Top 3 보고 약점 파악

### 5.3 특정 프롬프트 고치기 (LLM 필요)

LLM 기능 켜져 있으면 (§7.1 참고):
```bash
# ID는 list에서 복사
think-prompt rewrite 7KMQAZ9V --copy
```

**뭐가 일어나요?**
1. Claude Haiku에 "이 프롬프트 어떻게 개선할래?" 묻고
2. 개선본을 화면에 표시
3. `--copy` 있으면 **클립보드에 자동 복사** — 바로 Claude Code에 붙여넣기 가능

**예시:**
```
─── suggested rewrite ───
Goal: JavaScript 함수 디버깅 도움 요청
Context: React 19 프로젝트, TypeScript strict 모드
Task: 아래 함수가 TypeError를 내는 이유 분석 + 수정안 제시
Output format:
  1) 원인 설명 (2-3문장)
  2) 수정된 코드 (diff 블록)
  3) 테스트 방법 (bullet 2개)
Success criteria: 수정 후 Jest 테스트 모두 통과

[...함수 코드...]

✓ copied to clipboard
```

### 5.4 코치 모드 (인라인 힌트)

**"나쁜 프롬프트 칠 때마다 Claude가 먼저 확인 질문하게 하고 싶어"** 라면:

```bash
think-prompt coach on
think-prompt restart
```

이제 점수 낮은 프롬프트 치면, Claude가 답하기 전에 `[Think-Prompt coaching hint]` 로 "이거 맥락이 부족해 보이는데 확인부터 할게요" 같이 응답해요.

귀찮으면:
```bash
think-prompt coach off
think-prompt restart
```

### 5.5 점수가 너무 엄격하면?

기본 룰이 내 스타일에 안 맞으면 개별 끄기:
```bash
# R008 (긴 프롬프트에 예시 없음) 같은 거 끄고 싶으면:
think-prompt config set rules.custom_disabled '["R008"]'

# 여러 개 끄려면:
think-prompt config set rules.custom_disabled '["R008","R011"]'

# 새 설정 반영 + 기존 점수 재계산
think-prompt restart
think-prompt reprocess --all
```

---

## 6. 뭔가 이상해요 (트러블슈팅)

### 6.1 `pnpm install` 실패

**증상:** ENOENT, EACCES, permission denied 등

**해결:**
```bash
# 권한 문제면 다른 폴더로
cd ~/projects/think-prompt && sudo chown -R $(whoami) .

# 네트워크 문제면 재시도 또는 다른 네트워크
pnpm install

# pnpm 자체가 고장났으면
corepack enable && corepack prepare pnpm@10 --activate
```

### 6.2 `pnpm -r build` 실패

**증상:** `tsup` 에러, TypeScript 에러

**해결:**
```bash
# 완전 초기화 후 재시도
pnpm clean
rm -rf node_modules pnpm-lock.yaml
pnpm install
pnpm -r build
```

### 6.3 `think-prompt install` 후 doctor에 `⚠ no prompt_usages`

Claude Code 쓴 지 한참 됐는데도 프롬프트가 안 기록되는 경우.

**체크리스트:**
```bash
# 1. 훅이 settings.json에 있나
cat ~/.claude/settings.json | grep -c "think-prompt"
# 0이면 재설치: think-prompt install

# 2. 에이전트가 응답하나
curl -s http://127.0.0.1:47823/health
# {"ok":true,"pid":...,"port":47823} 안 나오면 재시작
think-prompt restart

# 3. 에이전트 로그 확인
tail -30 ~/.think-prompt/agent.log
```

**자주 터지는 원인:**
- Claude Code가 오래된 세션을 쓰고 있어서 새 settings.json을 안 읽음 → Claude Code 완전 종료 후 재시작
- 포트 47823이 점유됨 → `think-prompt config set agent.port 47825` 하고 restart

### 6.4 데몬이 죽음 (`think-prompt status` 에서 stopped)

```bash
think-prompt restart
think-prompt status
# 여전히 stopped면
tail -50 ~/.think-prompt/agent.log
tail -50 ~/.think-prompt/worker.log
```

로그 메시지에서 `EADDRINUSE` 같은 게 보이면 포트 충돌. 다른 포트로:
```bash
think-prompt config set agent.port 47825
think-prompt config set dashboard.port 47826
think-prompt restart
```

### 6.5 대시보드가 안 열림

```bash
# 1. 데몬 살아있나
think-prompt status
# dashboard 가 running 이어야 함

# 2. 브라우저에 수동으로
# http://127.0.0.1:47824

# 3. 방화벽이 막고 있나 (macOS)
# 시스템 환경설정 > 보안 > 방화벽에서 node 허용
```

### 6.6 "자기 건드렸는데 Claude Code 먹통됨"

이럴 일은 없어야 해요 (fail-open 원칙). 그래도 혹시:

```bash
# 즉시 훅만 제거 (데이터는 보존)
think-prompt uninstall
# Claude Code 재시작해서 정상 작동 확인

# 정상이면 원인 확인 후 다시:
think-prompt install
```

정말 긴급이면 `~/.claude/settings.json` 을 에디터로 열어 `think-prompt` 포함된 블록 직접 지우고 Claude Code 재시작.

### 6.7 로그 파일이 너무 커짐

```bash
du -sh ~/.think-prompt/*.log
# 100MB 넘으면:
truncate -s 0 ~/.think-prompt/agent.log
truncate -s 0 ~/.think-prompt/worker.log
# 로그 로테이션은 아직 자동 아님 (이슈로 등록 권장)
```

### 6.8 DB가 깨졌거나 이상한 값

```bash
# DB 백업 후 재시작
cp ~/.think-prompt/prompts.db ~/.think-prompt/prompts.db.backup
think-prompt restart

# 최악의 경우 — 전부 지우고 다시 (데이터 손실!)
think-prompt wipe --yes
# 다시 설치
cd ~/projects/think-prompt
node packages/cli/dist/index.js install
```

---

## 7. 고급 기능

### 7.1 LLM 심판 · 리라이터 활성화

Claude Haiku로 점수 낮은 프롬프트를 추가 평가하고 리라이트 만들어줍니다.

**1) Anthropic API 키 준비**
- https://console.anthropic.com/ 가입 후 API Key 발급
- 비용: 월 $5-20 수준이면 일반 사용 무리 없음

**2) 환경변수 설정**
```bash
# 한 번만 쓸 때
export ANTHROPIC_API_KEY=sk-ant-...

# 매번 자동으로 하려면 ~/.zshrc 또는 ~/.bashrc 에:
echo 'export ANTHROPIC_API_KEY=sk-ant-...' >> ~/.zshrc
source ~/.zshrc
```

**3) Think-Prompt에 LLM 켜기**
```bash
think-prompt config set llm.enabled true
think-prompt restart
```

**4) 확인**
```bash
think-prompt doctor
# ✓ LLM enabled (model=claude-haiku-4-5) 나오면 OK
```

이제:
- 점수 60 미만 프롬프트는 자동으로 LLM 심판이 추가 평가 (세션 끝나고 1분 내)
- `think-prompt rewrite <id>` 로 수동 리라이트 요청 가능

**비용 절감 팁:**
```bash
# 월 토큰 한도 (기본 50만 토큰)
think-prompt config set llm.max_monthly_tokens 100000
# 심판 트리거 점수 낮추기 (기본 60 → 50이면 덜 자주 호출)
think-prompt config set llm.judge_threshold_score 50
```

### 7.2 데이터 내보내기

주간 회고 때 자기 데이터를 엑셀/Notion으로 옮기고 싶으면:

```bash
think-prompt export --since 7d --out ~/weekly.json
```

JSON 구조:
```json
{
  "exported_at": "2026-04-20T...",
  "usages": [...],     // 프롬프트들
  "scores": [...],     // 점수
  "hits": [...],       // 룰 히트
  "sessions": [...]    // 세션
}
```

### 7.3 DB 직접 쿼리

뭔가 특별한 분석 하고 싶으면 SQLite 직접:

```bash
sqlite3 ~/.think-prompt/prompts.db

# 내가 자주 쓰는 단어?
.headers on
.mode column
SELECT substr(prompt_text, 1, 40) AS head, COUNT(*) AS n
FROM prompt_usages GROUP BY head ORDER BY n DESC LIMIT 10;

# 요일별 프롬프트 수
SELECT strftime('%w', created_at) AS dow, COUNT(*) FROM prompt_usages GROUP BY dow;

# 나가기
.quit
```

### 7.4 여러 프로젝트/폴더 분리해서 보기

현재는 `cwd` (프로젝트 경로)가 세션에 기록돼요. 필터링:

```bash
sqlite3 ~/.think-prompt/prompts.db "
SELECT s.cwd, COUNT(*) AS n, AVG(q.final_score) AS avg_score
FROM sessions s
JOIN prompt_usages pu ON pu.session_id = s.id
JOIN quality_scores q ON q.usage_id = pu.id
GROUP BY s.cwd ORDER BY n DESC;
"
```

### 7.5 PII 마스킹 테스트

프롬프트에 민감정보(이메일·전화번호 등) 있으면 자동 마스킹돼요. 확인:

```bash
sqlite3 ~/.think-prompt/prompts.db "
SELECT substr(prompt_text,1,30) AS original,
       substr(pii_masked,1,30) AS masked,
       pii_hits
FROM prompt_usages
WHERE pii_hits != '{}'
ORDER BY created_at DESC LIMIT 5;
"
```

현재 감지하는 것: 이메일, 한국 주민번호, 전화번호, 카드번호, AWS/Anthropic/OpenAI/GitHub 키, JWT, IPv4.

---

## 8. 제거하기

### 8.1 잠깐 꺼두기 (데이터 유지)

```bash
think-prompt uninstall
```

- `~/.claude/settings.json` 에서 훅만 제거
- 데몬 3개 모두 중지
- 데이터(`~/.think-prompt/`)는 그대로 유지

다시 쓸 때: `think-prompt install`

### 8.2 완전 제거

```bash
think-prompt wipe --yes
```

- 훅 제거
- 데몬 중지
- `~/.think-prompt/` **전체 삭제** (프롬프트 기록 다 날아감)

### 8.3 소스코드까지 완전 정리

```bash
cd ~/projects && rm -rf think-prompt
npm uninstall -g @think-prompt/cli 2>/dev/null || true  # npm link 해놨으면
```

---

## 9. 자주 묻는 질문 (FAQ)

### Q1. 내 프롬프트가 Anthropic에 가나요?
**아뇨.** 기본 설정으로는 어떤 데이터도 외부에 안 나가요. `LLM_enabled=true` 상태에서 `think-prompt rewrite` 할 때만 해당 프롬프트가 Anthropic API에 가는데, 이건 Claude Code 자체가 이미 하는 거랑 같아요.

### Q2. 회사 프로젝트에서 써도 돼요?
로컬 기록만 남고 외부 송출 없으니 보통 문제없지만, 회사 보안정책이 **"로컬에 코드 조각 저장 금지"** 같은 식이면 확인 필요. 그런 경우 `think-prompt config set privacy.store_original false` 로 원문 저장 끄고 해시·마스킹본만 남길 수 있어요.

### Q3. 속도 느려지나요?
훅당 평균 20-100ms. Claude Code 체감엔 영향 거의 없어요. 느껴지면 `think-prompt doctor` 해보세요.

### Q4. 얼마나 디스크 써요?
프롬프트당 평균 1-5KB. 하루 100개 친다 쳐도 1달에 10-50MB 수준. 보존 기간 기본 90일.

### Q5. Claude Code 없이 ChatGPT나 Cursor용은 없어요?
현재는 **Claude Code 전용**. Cursor/VSCode 확장은 Phase 2 계획(이슈 #9/후속).

### Q6. 실수로 민감한 프롬프트 남겼어요.
```bash
# 해당 usage_id 찾아서
think-prompt list --limit 50
# 개별 삭제 (CLI 미지원 — SQL 직접)
sqlite3 ~/.think-prompt/prompts.db "DELETE FROM prompt_usages WHERE id LIKE '%XXXXX';"
# 또는 전체 초기화
think-prompt wipe --yes
```

### Q7. 팀에서 공유해서 쓰고 싶어요.
아직 개인 전용. 팀 기능은 사용자 확보 후 검토 (D-001).

### Q8. 점수 100점 짜리 프롬프트는 어떻게 쓰나요?
룰 12개를 다 피하면 돼요:
- 4단어 이상 (R001)
- 출력 형식 명시 — "JSON으로", "bullet 3개로", "100자 이내" (R002, R010)
- 프로젝트/도메인 맥락 포함 — "이 React 프로젝트에서..." (R003)
- 한 번에 한 태스크 (R004)
- 인젝션 패턴 피하기 (R005)
- 성공 기준 명시 — "테스트 통과하면 완료" (R006)
- 대명사 최소화 (R007)
- 긴 요청엔 예시 첨부 (R008)
- 명확한 동사 쓰기 — "분석해줘", "리팩터해" (R009)
- 질문만 할 땐 배경 한 줄 (R011)
- 코드만 붙여넣지 말고 지시어 포함 (R012)

### Q9. 이거 버그 있는 것 같은데.
GitHub 이슈 주세요: https://github.com/must-goldenrod/think-prompt/issues

이슈 작성 시 `think-prompt doctor` 결과와 `~/.think-prompt/agent.log` 마지막 30줄 첨부해주면 훨씬 빨라요.

### Q10. 기여하고 싶어요.
`CONTRIBUTING.md` 참고. PR 환영해요.

---

## 마지막으로

막히면 이슈로 물어보는 게 가장 빨라요: https://github.com/must-goldenrod/think-prompt/issues

안 빠지고 몇 주만 써보시면 본인 프롬프트의 특정 약점(저는 맨날 "출력 형식 미지정" 걸려요...)이 눈에 보일 거예요. 그걸 고치는 게 이 도구의 진짜 값어치.

**Happy prompting! 🙌**
