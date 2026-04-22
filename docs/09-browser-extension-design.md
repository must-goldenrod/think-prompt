# 09 · 브라우저 확장 (Chrome Web Store / Edge / Firefox) 설계

> **Phase 2 로드맵의 핵심 확장 채널**.
> 여러 LLM 웹 UI(ChatGPT / Claude.ai / Gemini / Genspark / Perplexity / Mistral Chat / …) 에서 입력하는 프롬프트를 **로컬로** 수집·진단·개선.

---

## 📌 문서 성격

| 항목 | 값 |
|---|---|
| 상태 | `planning` (v0 초안) |
| 대상 릴리스 | **v0.3.0** MVP (ChatGPT only) → v0.4 멀티 사이트 → v0.5 통합 대시보드 |
| 선행 문서 | [`01-hook-design.md`](./01-hook-design.md), [`03-local-storage.md`](./03-local-storage.md), [`08-quality-criteria.md`](./08-quality-criteria.md) |
| 소유자 | 유지보수자 + 커뮤니티 베타 |

---

## 0. 기본 전제와 원칙

### 0.1 D-004 / D-030 그대로 승계
- **원문 프롬프트는 사용자 PC 밖으로 나가지 않는다.**
- 텔레메트리 없음. 서버 전송 없음.
- Chrome Web Store 공식 정책 위반 방지 핵심 자산.

### 0.2 새로 합의할 결정 (기본값 = 추천)
| # | 결정 | 기본값 | 근거 |
|---|---|---|---|
| **D-031** | Agent 의존성 | **Optional** (agent 있으면 바로 파이프, 없으면 IndexedDB 버퍼) | 설치 허들 최소. 대시보드 보고 싶으면 그때 agent 설치 |
| **D-032** | 첫 출시 사이트 범위 | **ChatGPT 단독** → 베타 피드백 후 Claude.ai/Gemini | 최소 DOM 면적, 최대 관찰 가능 유저 |
| **D-033** | 브랜드 | `Think-Prompt` 그대로, Store listing만 "Think-Prompt for Web" | 브랜드 조각화 방지 |
| **D-034** | 공개 시점 | **v0.3 unlisted 베타 → v0.4 공개** | 스토어 리젝 리스크 낮춤 |
| **D-035** | 데이터 전송 정책 | **localhost + IndexedDB only. 외부 전송 코드 완전 제거** | 코드 감사 통과를 쉽게 |

---

## 1. 아키텍처

```
┌────────────────────────── Chrome / Edge / Firefox Tab ─────────────────────────────┐
│                                                                                    │
│  User types into …                                                                 │
│   - chat.openai.com #prompt-textarea                                               │
│   - claude.ai [contenteditable]                                                    │
│   - gemini.google.com .ql-editor                                                   │
│   - genspark.ai textarea                                                           │
│   - perplexity.ai textarea                                                         │
│                                                                                    │
│          │                                                                          │
│          ▼                                                                          │
│   ┌───────────────────────────────────────┐                                         │
│   │ content-script                        │                                         │
│   │ (per-site DOM adapter)                │                                         │
│   │  - observes input field               │                                         │
│   │  - captures on "send" event           │                                         │
│   │  - NEVER modifies the page            │                                         │
│   └────────────────┬──────────────────────┘                                         │
│                    │ chrome.runtime.sendMessage({ kind: 'prompt', ... })           │
│                    ▼                                                                │
│   ┌───────────────────────────────────────┐                                         │
│   │ background service-worker             │                                         │
│   │  - on-device PII mask                 │                                         │
│   │  - dedup by hash                      │                                         │
│   │  - queue (IndexedDB)                  │                                         │
│   │  - send to localhost agent if up      │                                         │
│   │  - apply coach mode hint if enabled   │                                         │
│   └────────────────┬──────────────────────┘                                         │
│                    │ fetch (localhost-only)                                         │
└────────────────────┼───────────────────────────────────────────────────────────────┘
                     │
                     ▼  (optional — only if user installed the agent)
┌────────────────────────────────────────────────────────────────────────────────────┐
│  localhost:47823  (existing Think-Prompt agent, unchanged)                         │
│    /v1/ingest/web  ← new endpoint (source = "chatgpt" / "claude-ai" / …)           │
│    same pipeline: rules → score → dashboard → optional LLM judge                   │
└────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.1 주요 설계 특징
1. **Agent는 선택.** 없어도 확장은 혼자 돌아감 (IndexedDB에 마스킹본 저장, 토스트로 피드백).
2. **On-device 마스킹 필수.** localhost 호출 직전에 PII 패스 돌리고, 원문은 IndexedDB에만 (암호화 고려).
3. **단방향 관찰.** DOM을 수정하지 않음. 페이지 스크립트 개입 0.
4. **"send" 트리거만 기록.** 키보드 타이핑 중에는 기록하지 않음 (키로거 의심 방지 + 토큰 낭비 방지).
5. **소스 태깅.** agent로 보낼 때 `source: "chatgpt"|"claude-ai"|...` 를 추가해 다른 채널과 구분.

---

## 2. Manifest V3 골격

```json
{
  "manifest_version": 3,
  "name": "Think-Prompt for Web",
  "version": "0.3.0",
  "description": "Local-first prompt coach for ChatGPT, Claude, Gemini, and more.",
  "permissions": ["storage"],
  "host_permissions": [
    "https://chat.openai.com/*",
    "https://chatgpt.com/*",
    "https://claude.ai/*",
    "https://gemini.google.com/*",
    "https://www.perplexity.ai/*",
    "https://genspark.ai/*",
    "http://127.0.0.1:47823/*"
  ],
  "background": { "service_worker": "background/index.js", "type": "module" },
  "content_scripts": [
    { "matches": ["https://chatgpt.com/*"], "js": ["content/chatgpt.js"], "run_at": "document_idle" },
    { "matches": ["https://claude.ai/*"], "js": ["content/claude-ai.js"], "run_at": "document_idle" },
    { "matches": ["https://gemini.google.com/*"], "js": ["content/gemini.js"], "run_at": "document_idle" },
    { "matches": ["https://www.perplexity.ai/*"], "js": ["content/perplexity.js"], "run_at": "document_idle" },
    { "matches": ["https://genspark.ai/*"], "js": ["content/genspark.js"], "run_at": "document_idle" }
  ],
  "action": { "default_popup": "popup/index.html" },
  "options_page": "options/index.html",
  "icons": { "16": "icons/16.png", "48": "icons/48.png", "128": "icons/128.png" }
}
```

### 2.1 권한 명세 원칙
- **activeTab 안 씀** — 우리는 명시된 사이트에서만 동작.
- **`<all_urls>` 금지** — 스토어 리젝 사유 1순위.
- **host_permissions에 localhost 포함** — agent 연동에 필요. 설명에 명시.

---

## 3. 사이트 어댑터 (`packages/browser-extension/src/content/`)

각 어댑터는 **`PromptHook` 인터페이스** 하나를 구현.

```ts
export interface PromptHook {
  readonly siteId: 'chatgpt' | 'claude-ai' | 'gemini' | 'perplexity' | 'genspark';
  /** 입력창 DOM 노드를 반환. null이면 아직 없음 → MutationObserver로 재시도. */
  findInputRoot(): Element | null;
  /** 사용자가 제출할 때 호출될 이벤트 리스너 등록. callback에 최종 프롬프트 전달. */
  onSubmit(root: Element, cb: (prompt: string) => void): () => void;
  /** 대화 세션 식별자(브라우저 관점). URL 경로 또는 페이지 내 data attribute 기반. */
  getSessionId(): string;
}
```

### 3.1 예시 — ChatGPT 어댑터 (chatgpt.com)
| 대상 | 선택자 / 이벤트 |
|---|---|
| 입력창 | `textarea#prompt-textarea` (DOM 버전에 따라 `div[contenteditable="true"][id="prompt-textarea"]`) |
| 전송 버튼 | `button[data-testid="send-button"]` |
| 트리거 | 버튼 click + Enter keydown (Shift+Enter 제외) |
| 세션 ID | `location.pathname.match(/\/c\/([a-f0-9-]+)/)?.[1]` |

### 3.2 예시 — Claude.ai 어댑터 (claude.ai)
| 대상 | 선택자 / 이벤트 |
|---|---|
| 입력창 | `div[contenteditable="true"].ProseMirror` |
| 전송 버튼 | `button[aria-label="Send Message"]` |
| 트리거 | 위와 유사 |
| 세션 ID | URL `/chat/:id` |

### 3.3 회복 전략
DOM이 바뀌어 selector가 안 맞으면:
1. 어댑터는 `findInputRoot() === null` 반환.
2. `background`는 해당 사이트의 어댑터 버전을 `broken-selector` 로 마크.
3. 팝업 UI에 "ChatGPT adapter needs update" 경고 + 자동 리포트 링크.

---

## 4. 데이터 플로우

### 4.1 정상 경로
1. 사용자 입력 → `onSubmit` 콜백 → content script가 background에 메시지
2. Background service worker:
   - `maskPii()` (on-device, `@think-prompt/core/pii` 를 WASM이나 번들로)
   - `sha256` 해시
   - IndexedDB 에 row insert: `{ id, source, prompt_text, pii_masked, prompt_hash, created_at, synced: false }`
   - localhost agent 헬스체크 (`/health` → 200) → synced=true 로 전송 후 업데이트
3. Agent는 기존 파이프라인 통과 → 스코어 생성 → 대시보드에 나타남

### 4.2 agent가 없는 경우
- IndexedDB 에만 저장
- 확장 popup에서 **간이 스코어** 표시 (룰셋 일부를 확장에 번들)
- 유저가 agent 설치 후 한 번 "sync" 누르면 밀린 것 일괄 전송

### 4.3 coach mode 투사
- Claude Code와 달리 브라우저는 훅으로 context 주입 불가.
- 대안: **페이지 DOM 옆에 작은 힌트 오버레이** (확장 UI 레이어, 페이지 스크립트 개입 없음).
  - 낮은 스코어(`< 65`) 시 입력창 아래 회색 박스로 "📝 힌트: 출력 형식이 빠졌어요" 1줄 표시.
  - 클릭 시 상세 룰 히트.
- 스토어 정책상 "페이지 수정 최소" 라 페이지 DOM에는 붙이지 않고 **extension iframe / shadow root** 로 처리.

---

## 5. 프라이버시·신뢰 설계

### 5.1 사용자 관점 투명성
- 첫 설치 시 **설치 후 환영 페이지**에 쓰는 사이트, 로컬 저장소, 외부 전송 없음 명시.
- 각 사이트 탭에 작은 **green dot indicator** ("Think-Prompt is watching — click to pause").
- `options` 페이지에서 사이트별 on/off, 카테고리(개인/업무) 라벨로 전송 제외.

### 5.2 코드 감사 친화
- **외부 네트워크 호출은 localhost 하나뿐.** grep으로 확인 가능.
- `content_scripts`는 읽기만, `postMessage` 안 씀.
- `background`는 `fetch` 호출 URL을 화이트리스트로 ENV 상수화.

### 5.3 Chrome Web Store 정책 매칭
| 정책 요구 | 대응 |
|---|---|
| Purpose limitation | README/정책에 "프롬프트 품질 진단 전용" 단일 목적 |
| Minimal data | "send" 이벤트 시점만 수집. typing 중 수집 금지 |
| User notification | 온보딩 페이지 + indicator + options |
| Data use disclosure | 프라이버시 정책 URL (고정 도메인) |
| No data sale | 해당 없음 (외부 전송 0) |

---

## 6. 패키지 구조

```
packages/browser-extension/
├── manifest.json
├── src/
│   ├── background/
│   │   ├── index.ts            (service worker entry)
│   │   ├── queue.ts            (IndexedDB-backed queue)
│   │   ├── agent-client.ts     (localhost fetch w/ retry)
│   │   ├── coach.ts            (low-score → overlay trigger)
│   │   └── pii.ts              (re-exports @think-prompt/core/pii via bundler)
│   ├── content/
│   │   ├── base-hook.ts        (PromptHook interface + common helpers)
│   │   ├── chatgpt.ts
│   │   ├── claude-ai.ts
│   │   ├── gemini.ts
│   │   ├── perplexity.ts
│   │   └── genspark.ts
│   ├── overlay/                (shadow-root UI injected next to input)
│   │   └── hint.ts
│   ├── popup/                  (browser action)
│   │   ├── index.html
│   │   └── popup.ts
│   └── options/
│       ├── index.html
│       └── options.ts
├── public/
│   ├── icons/
│   └── privacy-policy.html
├── test/
│   ├── adapters/
│   │   ├── chatgpt.test.ts      (jsdom + fixture HTML)
│   │   └── ...
│   └── e2e/
│       └── chatgpt.spec.ts      (Playwright, real browser)
├── build.ts                    (esbuild / vite — no webpack)
└── package.json
```

### 6.1 빌드 체인
- **esbuild** (Manifest V3 친화, service worker mode 지원)
- `pnpm -F @think-prompt/browser-extension build` → `dist/`에 zip 준비
- CI: Chrome Web Store API로 unlisted 채널에 자동 업로드 (v0.4 이후)

---

## 7. Agent 측 API 추가

### 7.1 신규 엔드포인트 `/v1/ingest/web`
```json
POST /v1/ingest/web
Content-Type: application/json

{
  "source": "chatgpt" | "claude-ai" | "gemini" | "perplexity" | "genspark",
  "browser_session_id": "...",         // adapter가 URL 기반으로 산출
  "prompt_text": "...",                // 원문 (로컬 pipe)
  "pii_masked": "...",                 // 확장이 미리 마스킹한 사본
  "pii_hits": {"email": 1},
  "created_at": "2026-04-20T..."
}
```

### 7.2 DB 스키마 (migration 003)
- `sessions.source TEXT` — `'claude-code' | 'chatgpt' | 'claude-ai' | ...` 기본 `'claude-code'`
- `prompt_usages.browser_session_id TEXT NULL`
- 대시보드 필터에 Source 드롭다운 추가

### 7.3 보안
- 엔드포인트는 localhost bind만, 외부 인터페이스 listen 안 함 (기존과 동일)
- (선택) `X-Think-Prompt-Ext` 헤더 검사로 다른 로컬 프로세스가 실수로 호출하지 않게

---

## 8. 룰·코치 재사용

| 관심사 | 현재 상태 | 확장과의 관계 |
|---|---|---|
| 룰 R001~R018 | `@think-prompt/rules` dist 번들 | 확장 background에서 그대로 사용 가능 (ESM 호환) |
| 언어 감지 (franc-min) | `@think-prompt/core/lang` | 서비스 워커에 bundle; franc-min 자체가 작아 가능 |
| PII 마스킹 | `@think-prompt/core/pii` | 동일하게 번들 |
| 피드백 👍/👎 | 대시보드/CLI only | 확장 팝업에도 버튼 추가 고려 |
| LLM 심판/리라이터 | worker daemon | 확장은 그대로 agent/worker 경유 |

---

## 9. 롤아웃 단계

### v0.3.0 — ChatGPT 베타 (unlisted)
- 어댑터: ChatGPT 만
- IndexedDB 저장 + localhost agent 양방향
- 옵션: site on/off, indicator 표시
- Store: unlisted, 10~30명 초대

### v0.3.1 ~ v0.3.3 — 안정화
- ChatGPT DOM 변경 대응
- 에러 리포팅(로컬)
- 번역 (ko/en 팝업 i18n)

### v0.4.0 — 멀티 사이트 공개
- Claude.ai + Gemini + Perplexity 추가
- 크로스-소스 대시보드(필터)
- Store public 등록

### v0.5.0 — 통합 경험
- Genspark/Mistral/기타 longtail
- 동일 프롬프트의 **모델별 성공률** 비교 UI
- 리라이트를 확장 안에서 1-click 주입 (overlay "replace with improved" 버튼)

### v0.6.0 — Edge/Firefox + 팀 공유
- Firefox WebExtensions 호환 (MV3가 완전 지원되면 자동)
- Edge Add-ons 등록
- Team mode (Opt-in, 암호화 동기화)

---

## 10. 리스크·완화

| 리스크 | 가능성 | 영향 | 완화 |
|---|---|---|---|
| ChatGPT DOM 변경 | 높음 | 중 | 어댑터 CI에 Playwright 스모크. broken-selector 자가 감지. |
| Store 리젝 | 중 | 높 | unlisted 베타로 리젝 리스크 절감. 리뷰 사유 대응 플레이북. |
| 악성 확장과 동일 시각 | 중 | 중 | 설치 시 "외부 전송 없음" 강조. 로고/톤에서 신뢰 UI. |
| MV3 service worker 30초 제한 | 중 | 중 | 모든 작업 단발성. 장시간 작업 → IndexedDB queue로 |
| localhost fetch 실패 | 높음 | 낮 | IndexedDB 큐 그대로 둠. agent 살아나면 자동 sync |
| 사용자가 개인 대화에 켰음을 잊음 | 중 | 높 | indicator 항시 표시. 탭 프리뷰에 "recording" 아이콘 |
| 사이트 ToS 충돌 | 낮 | 중 | DOM 읽기만 + 페이지 스크립트 주입 없음 → 대부분 ToS는 문제없음. 정책 URL에 명시. |

---

## 11. 오픈 질문 / 결정 필요

- **Q1.** 확장 설치 시 자동으로 agent를 찾아 연결 — 못 찾으면 설치 가이드를 보여줄지? (추천 Yes)
- **Q2.** IndexedDB 저장도 암호화해야 할지 (공격자가 PC 접근 시)? (추천 Defer to v0.5)
- **Q3.** ChatGPT plus 사용자의 memory 기능과 겹치는 데이터가 있을 때 어떻게 표시?
- **Q4.** Voice input (ChatGPT voice mode) 도 캡처 대상? (추천 NO — 음성은 별도 동의)
- **Q5.** 동일 프롬프트를 여러 사이트에 복붙할 때 단일 행으로 보여줄지, 각 사이트별로 따로 볼지?

---

## 12. 다음 액션

- [ ] **이슈 #14 Epic** 생성: "Browser extension Phase 2 (v0.3)"
- [ ] `packages/browser-extension` 스캐폴딩 (manifest + background + ChatGPT 어댑터 최소)
- [ ] **POC 스파이크**: ChatGPT 탭에서 "send" 이벤트 캡처 → localhost agent 도달 확인
- [ ] Agent: `/v1/ingest/web` + `source` 컬럼 추가 (migration 003)
- [ ] Chrome Web Store developer 계정 준비
- [ ] Privacy policy URL 호스팅 (GitHub Pages 가능)

---

## 13. 참고 자료

- [Chrome Extensions MV3 docs](https://developer.chrome.com/docs/extensions/mv3/)
- [Lakera GPT Privacy extension](https://chrome.google.com/webstore/) — on-device PII masking 선행 사례
- [Web Store policy](https://developer.chrome.com/docs/webstore/program-policies/) — 리뷰 가이드
- 내부 문서: [01-hook-design.md](./01-hook-design.md) §3.2 브라우저 확장 민감성 논의

---

## 변경 이력

| 날짜 | 변경 | 작성자 |
|---|---|---|
| 2026-04-20 | v0 초안 — 아키텍처·Manifest·사이트 어댑터·롤아웃 단계 | 초기 |
| 2026-04-22 | v0.3.1 하드닝 — CORS/PNA preflight, SPA 네비 중복 캡처 방지, 컨텍스트 무효화 가드, MAX_PROMPT_CHARS 상한, 메시지 스키마 런타임 검증, sender id 게이트, 민감 필드 skip, drain 재진입 가드, onInstalled 온보딩 탭, `_locales/{en,ko}` 뼈대, manifest `minimum_chrome_version=104` + `homepage_url`, Options "Clear all" + Popup "Retry stuck", 프로덕션 minify 빌드 프로파일, `scripts/package.mjs` → zip, CI `extension-package` 잡 | v0.3.1 |
