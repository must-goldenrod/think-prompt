# 10 · 런칭 · 프로모션 · 커뮤니티 전략

> 이 문서는 v0.1.0 공개 런칭을 위한 **운영 플레이북** 이다.
> 대부분 체크리스트 형식으로, 순서가 있다.
>
> 전제:
> - 타겟 청중 = Claude Code 를 일상적으로 사용하는 개발자
> - 핵심 메시지 = "로컬 중심 · 프라이버시 · 무료 OSS"
> - 첫 공개는 **v0.1.0 npm publish** 가 성공한 **직후 24시간 이내**
>
> 성공 지표(3개월 기준):
> - npm 주간 설치 500+
> - GitHub stars 200+
> - GitHub Discussions 월 10건+
> - 외부 컨트리뷰터 3명+

---

## 0. 런칭 전 T-7 ~ T-1 체크리스트

`v0.1.0` 태그 push 전 **필수 준비물**. 체크리스트 한 줄이라도 빠지면 런칭 지연 권장.

### 기술

- [ ] `pnpm run ci` 로컬에서 그린
- [ ] `pnpm run release:dry` tarball 6개 실제 파일 확인 (dist 포함 · devDep 제외)
- [ ] `npm view @think-prompt/cli` 이름 충돌 여부 확인 (404 나와야 함)
- [ ] `NPM_TOKEN` GitHub secret 등록 완료
- [ ] `@think-prompt` npm 조직 생성 (free tier)
- [ ] CHANGELOG.md `## [0.1.0] - 2026-MM-DD` 섹션 작성
- [ ] README "30초 맛보기" 의 `npm install -g @think-prompt/cli` 명령이 실제 동작할 예정임을 확인

### 콘텐츠

- [ ] **30초 데모 GIF** 녹화 (이게 가장 중요)
  - 추천: `asciinema rec` → `svg-term-cli` 로 SVG 변환 또는
  - QuickTime 으로 화면 녹화 → `ffmpeg` 로 GIF 변환
  - 내용: `think-prompt install` → 새 Claude Code 세션 → 프롬프트 치기 → `think-prompt open` → 점수가 뜨는 순간
- [ ] **홈페이지** (별도 PR F) 배포 완료 — `npm install` 한 줄 복사 버튼 동작
- [ ] **Show HN 포스트 초안** 작성 (아래 §2 참조)
- [ ] **트위터 thread 초안** 작성 (아래 §2 참조)
- [ ] **r/ClaudeAI 포스트 초안** 작성

### 운영

- [ ] GitHub Discussions 활성화 (Settings → Features → Discussions ✓)
- [ ] Discussion categories 만들기: General · Q&A · Ideas · Show and Tell · Announcements
- [ ] README 배지 추가: CI · license · npm version · downloads
- [ ] GitHub repo "About" 섹션 채우기 (description, topics, website URL)
- [ ] Repo topics: `claude-code`, `prompt-engineering`, `developer-tools`, `local-first`, `privacy`, `typescript`, `cli`

---

## 1. T-0 launch day (실제 런칭 당일)

**한 번에 다 하지 말고** 오전/오후로 분산. 트래픽 peak 을 관찰할 시간이 필요하다.

### 오전 (KST 08:00 ~ 10:00, 미국 EST 전날 밤)

1. `v0.1.0` 태그 push → 릴리스 워크플로 감시
2. npm 페이지 로딩 확인 (`npm view @think-prompt/cli`)
3. `npm install -g @think-prompt/cli` 로 깨끗한 VM/컨테이너에서 E2E 검증
4. 홈페이지 마지막 한 번 스모크 테스트

### 오후 (KST 14:00 ~, 미국 EST 00:00 ~ = HN prime time)

5. **Show HN** 포스트 (아래 §2.1 템플릿) — HN 새 글 상단에 뜨는 시간에 올리기
6. 30분 후: **Twitter thread** 올리고 `@AnthropicAI` 태그
7. 1시간 후: **r/ClaudeAI** 포스트
8. 2시간 후: **Anthropic Discord** (unofficial-tools 채널이 있으면 거기)

### 저녁 (KST 22:00 ~)

9. **첫 댓글 응답** 개시. 최초 2시간이 가장 중요 — 답글 속도 = OSS 관심도 신호
10. 버그 리포트 들어오면 **핫픽스** 준비 (0.1.1 가능성 열어둠)

**절대 금지**:
- 여러 채널 동시 포스팅 — 한 번에 하나씩, 간격 두고
- 댓글 방어 — 비판은 "고맙다, 그 관점으로 다시 보겠다" 가 기본 톤
- 런칭 당일 새 기능 push

---

## 2. 채널별 런칭 포스트 템플릿

### 2.1 Show HN

**제목 패턴** (50자 이하, 과장 금지):

- `Show HN: Think-Prompt – a local-first Claude Code prompt coach`
- 대안: `Show HN: I built a tool that scores your Claude Code prompts locally`

**본문 (300~500단어 권장)**:

```
Hi HN, I built Think-Prompt to see which of my Claude Code prompts
actually work and which are terrible. It's a local-only tool — installs
as a Claude Code hook, collects every prompt into a SQLite file on your
machine, scores it against 18 antipattern rules, and shows the result
in a local dashboard.

Why local-only: prompts often contain project context, file paths, or
half-typed secrets. I wasn't comfortable running them through yet
another SaaS. Think-Prompt never phones home; if you enable the
optional deep-analysis feature it sends PII-masked text directly to
Anthropic (your own API key), nowhere else.

What's there:

- Hook-based auto capture (UserPromptSubmit + transcript post-parse)
- 18 rules across categories like missing_context, multi_task,
  no_output_format
- Dashboard in 5 languages (en/ko/zh/es/ja)
- `think-prompt backfill` — import your entire ~/.claude/projects
  history (often 10k+ prompts)
- Opt-in deep analysis via Claude Haiku — returns problems,
  step-by-step reasoning, and a rewrite

Not there (yet):
- Windows support (macOS/Linux only)
- Team sharing / server sync (deliberately no server — see the
  decision log)

What I'd love feedback on:
- Which rule is wrong for your workflow?
- What's your #1 "wish it could do X" for prompt reflection?

Install: npm install -g @think-prompt/cli && think-prompt install
Repo: https://github.com/must-goldenrod/think-prompt
Home: https://think-prompt.dev (or whatever domain)
```

**응답 준비**: "왜 CLI 기반인가?" · "Anthropic 가 이미 수집하지 않나?" · "rule 들이 영어 위주 아닌가?" — 이 3개 질문은 거의 확실히 나온다.

### 2.2 Twitter / X thread

```
[1/6] I just open-sourced Think-Prompt — a local-first dashboard that
shows you which Claude Code prompts of yours actually work.

No server. No account. It runs entirely on your machine.

npm install -g @think-prompt/cli 🧵

[2/6] Why: I'd been writing Claude Code prompts for months with no idea
which ones were actually good. Too short? Missing context? Multi-tasking?
I wanted numbers.

[3/6] How it works: installs a Claude Code hook, captures every prompt,
scores it against 18 rules locally, surfaces the patterns in a
dashboard at 127.0.0.1:47824.

Your prompts never leave your machine. Ever.

[4/6] [GIF of dashboard]

[5/6] Also has:
- Backfill your ENTIRE ~/.claude history (often 10k+ prompts)
- Dashboard in en/ko/zh/es/ja
- Opt-in deep analysis via Claude Haiku (your key, you control)

[6/6] MIT, free, no team pressure.

Repo: github.com/must-goldenrod/think-prompt
Home: think-prompt.dev

@AnthropicAI — hope this is useful to the community.
```

### 2.3 r/ClaudeAI

```
Title: I built a local-only Claude Code prompt coach — shows which of my
prompts are actually good

Body:
Spent the last few months writing Claude Code prompts with no feedback
loop. Built Think-Prompt to fix that.

It's a CLI + local dashboard that:
- Auto-captures every prompt you send in Claude Code (via the official
  hook system)
- Scores it against 18 antipattern rules locally
- Shows a tier breakdown, daily chart, "worst 5" leaderboard
- Lets you opt into deep LLM analysis with step-by-step reasoning

Everything stays on your machine unless you click "deep analyze".

[screenshot of dashboard]

Install:
    npm install -g @think-prompt/cli
    think-prompt install

Repo: <link>

Open to feedback — especially if a rule is wrong for your style.
```

### 2.4 Dev.to / Hashnode (T+3 days)

**제목**: "What I learned analyzing 10,000 of my own Claude Code prompts"

- 런칭 당일이 아닌 **3~5일 후** — HN 트래픽이 가라앉은 시점
- 실제 자신의 DB 스크린샷·통계 공개 (UGC 의 시드)
- 결론은 "특정 rule 이 X% 의 내 프롬프트에 hit" 같은 구체 숫자

---

## 3. 커뮤니티 운영 (T+1주 ~ T+3개월)

### 1차 포럼 = GitHub Discussions

**초기에 Discord 를 먼저 만들지 말 것**. 이유:
- 유지 부담 (moderation, 24/7 대기)
- 검색 불가능 (SEO 가치 0)
- "죽은 Discord" 는 "없는 Discord" 보다 나쁜 신호

대신:
- Discussion categories 를 적극적으로 분류
- Q&A 답변 후 `Mark as answer` → 검색 가능한 자산화
- 매 릴리스에 **Announcements** 로 CHANGELOG 요약 포스트

**Discord 로 전환할 타이밍**: Discussions 월 30건+ 지속 3개월 후.

### 매주 1회 "Release note" 트윗

예:

```
Think-Prompt v0.1.3 📦

- New rule R019: too_many_modals ("can you please try to maybe...")
- Japanese dashboard translation polish
- Backfill 2x faster via WAL tx batching

npm install -g @think-prompt/cli@latest
```

가능하면 **시각 자료 1개** 첨부 (before/after 스크린샷, 작은 GIF, 통계 차트). 텍스트만 있는 릴리스 노트는 engagement 가 급감한다.

### 월 1회 유저 인터뷰

- Discussions 활발 유저 1명 선정
- 15분 Zoom/Meet, 단 1가지 질문: "지난 1개월간 Think-Prompt 가 당신의 프롬프트 쓰기를 어떻게 바꾸었나요?"
- 허락 받고 **블로그 포스트** 화. 유저 이름·쉬게 기억되는 워크플로 공개.
- **인터뷰 대상자에게는 후배 추천 권한** (1명). 컴뮤니티 recursion.

### 외부 컨트리뷰터 3명 확보

각 유형 하나씩 확보 목표:
1. **Rule 기여자** — 새 R0xx 룰 PR + positive/negative 샘플
2. **번역 기여자** — 6번째 언어 i18n (프랑스어? 인도네시아어? 베트남어?)
3. **어댑터 기여자** — 브라우저 확장에 새 사이트 어댑터, 또는 OpenAI/Gemini LLM adapter

"good first issue" 라벨 5개를 **미리** 만들어 두고 각 유형마다 1~2개씩 배치.

---

## 4. 프로모션 · 검색 최적화 장기전

### SEO 키워드

타겟 검색어 (Google):
- `claude code prompt quality`
- `claude code dashboard`
- `local prompt engineering tool`
- `claude code hooks tutorial`
- `~/.claude/projects what is`

홈페이지 title / meta description 이 이걸 흡수해야 함.

### 크로스 링크 전략

- npm 페이지 description 에 "github.com/must-goldenrod/think-prompt" 포함 (이미 적용)
- README 에 homepage URL 포함 (패키지 메타데이터 경유 npm 페이지에 자동 노출)
- Discussions 답변마다 관련 docs/ 링크 적극 포함 (SEO juice)
- 타사 블로그 코멘트에서 언급될 때 nofollow 여도 referral 경로로 이점

### Awesome-List / Directory 등록

런칭 T+2주 이후:
- awesome-claude 시리즈 (존재한다면)
- awesome-developer-tools
- awesome-ai-tools
- awesome-local-first

PR 로 알파벳 순 유지 + 1줄 description. spam 금지.

### 컨퍼런스 / 팟캐스트

T+3개월 이후 고려:
- **LangChain / AI engineering** 컨퍼런스 CFP
- Anthropic hosted 이벤트 (있다면)
- Practical AI / Changelog 팟캐스트 초대 (메일 한 통 비용)

---

## 5. 지표 추적

런칭 후 매주 한 번 기록 (스프레드시트 또는 Notion):

| 주차 | npm weekly | GitHub ⭐ | Discussions 신규 | PR 신규 | 외부 기여자 누적 | 비고 |
|---|---|---|---|---|---|---|
| W1 |  |  |  |  |  | Show HN launch |
| W2 |  |  |  |  |  |  |
| W4 |  |  |  |  |  | 첫 월간 리뷰 |
| W12 |  |  |  |  |  | **3개월 retro** |

**3개월 retro 에서 판단할 것**:
- 지표가 목표 50% 미만 → 메시지 / 채널 재검토
- 지표가 목표 달성 → 다음 단계: Discord 오픈, Windows 지원 착수, 유료 hosted 모드 조사
- 컨트리뷰터 0명 유지 → "good first issue" 라벨 부족 또는 PR 리뷰 느림 — 즉시 개선

---

## 6. 비상 시나리오

### Show HN 실패 (front page 미진입, 단순 "new" 묻힘)

- 즉시 재시도 금지. HN 은 연속 재포스팅을 패널티.
- T+2주 후 다른 각도로 재시도 ("I analyzed 10k prompts" 식 데이터 포스트)

### 런칭 후 심각 버그 제보

- `0.1.1` 핫픽스 1~2시간 내 push (fail-open 덕에 심각도 낮은 편)
- 해당 이슈의 advisory 공개 여부 판단 (보안 이슈면 SECURITY.md 프로세스)

### 악의적 의도 / harassment

- CODE_OF_CONDUCT.md 에 따라 warn → mute → ban
- Discussions 에서 발생 시 moderator 2명 이상의 합의 후 액션
- 공개 repo 이므로 fork 는 기본 허용 — 악의적 fork 삭제 요구는 아주 드문 경우만 (DMCA 등)

---

## Open items

다음에 이 문서를 업데이트할 때 다루어야 할 것들:

- [ ] 도메인 확정 (`think-prompt.dev` vs `thinkprompt.ai` vs 다른 것)
- [ ] Twitter 핸들 확정 (@thinkprompt_dev? @ThinkPromptCLI?)
- [ ] Show HN 포스트 A/B 제목 3개 중 하나 선택
- [ ] 30초 데모 GIF 스토리보드 확정
