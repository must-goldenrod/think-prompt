# Changelog

All notable changes to Think-Prompt follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

During the `0.x` series breaking changes may occur in any minor release; the
stability guarantees of v1.0 do not yet apply.

## [Unreleased]

_No unreleased changes._

---

## [0.5.0] — 2026-04-24

Two-stage learning loop release: **per-prompt inline hints** on the
Prompts list (individual level) + **Patterns to watch Top-5** on
Overview (aggregated level). Plus locale-aware timestamps across the
dashboard.

### Added
- **Inline improvement hint on Prompts list** — every weak/bad-tier
  row (KO locale) now shows a one-line `→ {shortTip}` under the
  prompt snippet, derived from the highest-severity rule hit for that
  prompt. No drill-in required to see "what to fix next time".
  Good/ok rows stay single-line so the signal is preserved. D-043.
- **"Patterns to watch" Top-5 on Overview** — aggregates the five
  most frequently hit rule_ids over the last 30 days between the KPI
  row and the Daily chart. Each entry shows a severity-colored bar,
  the rule id, a KO `shortTip` (or description fallback for non-KO),
  and the hit count. Empty state: "최근 30일 반복 패턴 없음 —
  잘하고 계세요.". D-044.
- **`shortTip` field on all 18 rule examples** — one-line imperative
  actions (≤ 35 Korean characters). `getRuleShortTipKo(ruleId)`
  helper exported for reuse. Feeds both D-043 and D-044 surfaces.
- **i18n · Overview patterns section** — three new keys
  (`overview.patterns_to_watch`, `overview.patterns_window`,
  `overview.patterns_empty`) translated across en / ko / zh / es / ja.
- **`created_at` timestamps shown in the locale's home timezone** —
  Prompts table, Overview "Recent" list, and Detail meta all render
  `YYYY-MM-DD HH:MM:SS` in `Asia/Seoul` (ko), `Asia/Tokyo` (ja),
  `Asia/Shanghai` (zh), `America/New_York` (en, DST-aware),
  `Europe/Madrid` (es, DST-aware). DB still stores UTC ISO; conversion
  happens at render time via `Intl.DateTimeFormat`. Raw `...T...Z`
  millisecond-precision strings no longer surface in the UI. D-042.

### Testing
- Dashboard suite: 58 → **66 tests** (+8 for D-043 / D-044 regression
  coverage — ordering, locale fallback, empty state, good-tier
  signal preservation).
- Full suite: 226 → **234 tests**, all passing across 23 files.

### Decisions logged
- **D-042** · Locale-aware `created_at` timezone rendering.
- **D-043** · Prompts list inline hint on weak/bad rows.
- **D-044** · Overview "Patterns to watch" Top-5 (30-day window).

---

## [0.4.0] — 2026-04-23

Removes the `think-prompt rewrite` feature in response to user feedback
that it wasn't part of the intended product surface. The deep analysis
feature (`think-prompt analyze`, consent-gated, D-033) is unaffected —
it's a separate opt-in path with its own UI and data path.

### Removed (breaking)
- **`think-prompt rewrite <id>` CLI command** — the command no longer
  exists. Use `think-prompt analyze` if you want a consent-gated LLM
  suggestion pass.
- **`rewrites` SQLite table** — dropped by MIGRATION_005 on existing
  installs. Any historical auto-generated rewrites are discarded.
- **`rewrite` queue job kind** — no longer enqueued by the worker.
- **Dashboard detail page: "Improved" column, hero rewrite CTA,
  "Previous rewrites" section** — prompt detail is now Score → Why →
  How without the rewrite suggestion slot.
- **i18n keys** — `detail.suggested_rewrites`, `detail.rewrite_none`,
  `detail.rewrite_cta`, `detail.rewritten`, `detail.previous_rewrites`
  removed across all 5 locales.

### Changed
- `think-prompt doctor` no longer counts the `rewrites` table and no
  longer mentions "rewrite" in its LLM-disabled hint (it still
  mentions `deep-analysis skipped`).

### Decisions logged
- **D-041** · `think-prompt rewrite` feature removed.

---

## [0.3.0] — 2026-04-23

Dashboard coaching UX release. Pivots `/prompts/:id` from a query-dump
view into a coaching session (Score → Why → How), exposes each tier
count as its own KPI tile on Overview, aligns the color/font palette
with the canonical marketing site (emerald `#10b981` + ink dark scale
+ Inter + JetBrains Mono), and ships 18 Korean bad/good coaching
examples inline on the detail page. Capture / backfill / hook
pipelines unchanged.

### Added
- **Prompt Detail page reframed as a coaching session** — hero card
  with the big score + tier + one-line diagnosis derived from the top
  two rule hits + rewrite CLI command; original and the latest
  rewrite sit side-by-side so users can compare; previous rewrites
  demote to their own section; feedback 👍👎 moves below the main
  content so users rate AFTER reading; meta (session/chars/turn/id)
  collapses into `<details>`. D-040 · PR #39.
- **Rule hits render as lesson cards** — severity-colored left bar
  (sev 3 red / 2 orange / 1 yellow), rule id + SEV badge, message,
  and — in KO locale — a concrete 약한 예 / 강한 예 + optional 💡
  habit tip. D-040 · PR #39.
- **`packages/dashboard/src/rule-examples.ts`** — 18 Korean bad/good
  coaching examples (R001…R018) inlined for the detail page. Other
  locales fall back to message-only rendering; English / Japanese /
  Chinese / Spanish coaching copy is a follow-up. D-040 · PR #39.
- **Overview KPI row** — Total prompts + 5 tier tiles (GOOD, OK,
  WEAK, BAD, N/A) in a responsive 6-card grid (`grid-cols-2
  md:grid-cols-3 lg:grid-cols-6`), each with a big mono number,
  tier-colored left bar, and percentage subtitle. The `Tier
  breakdown` section label is preserved as `aria-label` on the tile
  group. PR #38.
- **Brand favicon** — accent-colored rounded-square with three
  ascending bars (the dashboard signature), served from the
  dashboard at `/favicon.svg` with a one-day cache and shipped
  alongside the site at `site/favicon.svg`. PR #36.

### Changed
- **Dashboard brand tokens realigned with the canonical marketing
  site** — `accent: #6366f1 → #10b981` (emerald), `ink` scalar →
  scale (`950..600`), font cascade `Inter + Noto Sans KR/JP/SC +
  ui-sans-serif` + `JetBrains Mono + ui-monospace`, emerald focus
  ring + `::selection`, emerald favicon. Google Fonts preconnect +
  CSS link injection. D-038 (supersedes D-037) · PR #37.
- **Prompts table UX pass** — `Created` column moves leftmost,
  `Hits` column dropped, placeholder + submit button switched from
  "rule id e.g. R003 / Filter" to **"Search"** across all 5 locales
  (placeholder and label share the same translated word), tier
  badge upgraded to `bg-*-50 text-*-700 ring-1 ring-*-600/40` with
  uppercase ASCII label (GOOD/OK/WEAK/BAD/N/A) and dark-mode
  mapping; `aria-label` retains the locale-translated tier label
  for screen readers. D-039 · PR #37.
- **`Rules` hidden from the main nav** — the rule catalog is a
  meta-view; the route and i18n keys stay intact so README/issue
  deep-links still resolve. D-036 · PR #29.
- **`renderDailyChart` axis-label strategy** — windows > 45 bars
  switch from per-day `MM/DD` to per-month `YY-MM` and suppress
  per-bar totals so 90/365/all views stay readable. PR #26.
- **Live-refresh reliability** — polling cadence 6 s → **3 s**,
  wake events widened from `visibilitychange` alone to include
  `focus` + `pageshow` so background-throttled tabs tick promptly
  after the user returns. Live-refresh coverage extended from
  Overview + Prompts list to `/prompts/:id`, `/rules`, `/doctor`;
  `/settings` remains excluded to protect form input. PR #28.
- **Card tone** — `rounded-lg shadow` → `rounded-xl border
  border-gray-200 shadow-sm` across the dashboard for a flatter,
  site-matching silhouette. PR #37.

### Fixed
- **agent `/v1/hook/post-tool-use`** now upserts the session row before
  bumping the tool-use rollup. Previously, if `PostToolUse` fired for a
  session that had not yet produced a `SessionStart` / `UserPromptSubmit`
  (e.g. hooks installed mid-session), the `tool_use_rollups.session_id`
  foreign key constraint failed and the event was dropped. Fail-open
  swallowed the error, so this was invisible to users but silently
  under-counted tool rollups for that session. Matches the upsert
  pattern already used by the other five hook handlers. Fixes #11.

### Testing
- Dashboard suite: 45 → **58 tests** across PR #36/#37/#38/#39.
- Full suite: 212 → **224 tests**, all passing across 23 files.

### Decisions logged
- **D-036** · `/rules` catalog hidden from main nav.
- **D-037** · (superseded) dashboard brand tokens tuned to indigo.
- **D-038** · dashboard brand tokens realigned to emerald + ink
  scale (supersedes D-037).
- **D-039** · Prompts table UX pass (Created leftmost, Hits
  removed, Search label, strong tier badges).
- **D-040** · `/prompts/:id` reframed as a coaching session.

---

## [0.2.0] — 2026-04-23

Dashboard UX + brand alignment release. Adds 30-day default / long-window
month labels to the chart, replaces manual-refresh with real live updates
across the whole dashboard, hides the internal rules catalog from the
main nav, and pulls the dashboard's colors / fonts / card tone into
alignment with the marketing site. Backfill + live-capture pipelines
unchanged.

### Added
- **R013 `pii_detected`** — new safety rule that escalates severity 1 → 3
  based on how many distinct PII categories the masker caught in the
  prompt (email / phone / RRN / API keys / JWT / IP). Addresses C-036.
- **R014 `vague_adverb`** — new style rule flagging 좀/대충/그냥/kinda/
  probably/maybe etc. Addresses C-023.
- **Dashboard period selector** — 7 · 14 · 30 · 90 · 365 · all pills on
  the Overview chart; default 30 days. `?days=` query param is the
  single source of truth for window size.
- **Chart: dense-mode axis labels** — charts with n > 45 bars switch
  from per-day `MM/DD` to per-month `YY-MM` labels and suppress
  per-bar totals, so 90/365/all views stay readable. PR #26, D-none.
- **Live-refresh coverage** — `/prompts/:id`, `/rules`, `/doctor` now
  auto-reload when a new prompt lands, matching Overview + Prompts
  list. `/settings` deliberately excluded to preserve form input.
  PR #28.

### Changed
- **Live-refresh interval 6 s → 3 s** with `focus` + `pageshow` event
  listeners added to `visibilitychange`, so background-throttled tabs
  tick within one frame of returning to focus instead of up to a
  minute later. PR #28.
- **Rules catalog (`/rules`) removed from the main nav** — route still
  responds for README/issue deep-links, but the meta-view is no
  longer a user-facing tab. D-036 · PR #29.
- **Dashboard brand tokens unified with the marketing site** — shared
  `ink: #0b0d12` and `accent: #6366f1` (indigo) tokens, Inter + SF
  Mono font cascade, accent-colored `:focus-visible` ring, accent dot
  before the wordmark. All `blue-6xx` utility classes swapped to the
  `accent` token; cards moved from `rounded-lg shadow` to
  `rounded-xl border shadow-sm` for a flatter, site-matching tone.
  D-037 · PR #30.
- **R004 `multiple_tasks`** now also fires on `//` or `/` separators
  when combined with ≥ 2 imperative verbs, catching the "요약 // 번역
  // 표로" pattern that slipped through the conjunction-only detection.
  Addresses C-004.
- **R012 `code_dump_no_instruction`** threshold lowered 80% → 65% after
  dogfooding surfaced the "7 lines of code + short question" pattern
  that used to evade detection. Addresses C-007.
- **R003 `no_context`** keyword dictionary extended to cover Japanese
  (プロジェクト / ファイル / 関数 / …), Simplified Chinese (项目 /
  代码 / 文件 / …), Traditional Chinese (專案 / 檔案 / 函數 / …), and
  more JS/Python web-framework names. Addresses C-009 and partially
  C-049 / C-050.

### Testing
- Dashboard suite: 28 → **45 tests** (+17 covering chart dense mode,
  live-refresh coverage + wake events, rules-hidden regression, brand
  tokens and blue-class absence).
- Full suite: 53 → **212 tests**, all passing across 23 files.

### Decisions logged
- **D-036** · Rules catalog hidden from user-facing nav.
- **D-037** · Dashboard brand tokens unified with `site/index.html`.

---

## [0.1.0] — 2026-04-20

Initial public release.

### Added
- **Monorepo** (`pnpm` workspaces) with six packages:
  - `@think-prompt/core` — SQLite schema v1, config, logger, PII masking, queue,
    transcript parser, minimal Anthropic client, quality scorer.
  - `@think-prompt/rules` — 12 antipattern rules (R001 … R012) with Korean +
    English keyword sets, plus a registry.
  - `@think-prompt/agent` — Fastify HTTP receiver exposing six Claude Code hook
    endpoints (`user-prompt-submit`, `session-start`, `subagent-start`,
    `subagent-stop`, `post-tool-use`, `stop`). Fail-open on every path.
  - `@think-prompt/worker` — background daemon consuming a JSONL queue; parses
    session/subagent transcripts, computes usage scores, runs the optional
    LLM judge, and produces rewrites.
  - `@think-prompt/dashboard` — local web UI at `http://127.0.0.1:47824` with
    overview, prompt list/detail, session timeline, rules catalog, settings,
    and doctor pages.
  - `@think-prompt/cli` — `think-prompt` binary with 18 subcommands:
    `install/uninstall/start/stop/restart/status/doctor/list/show/rewrite/
    coach/config/reprocess/export/open/wipe`.
- **Local-first storage** at `~/.think-prompt/` (SQLite WAL + JSONL queue).
- **Coach mode** — optionally injects `additionalContext` back into the
  model to nudge better prompts without blocking the user.
- **Rule-based quality score** (`rule_score 70% + usage_score 30%`) with
  LLM judge as a tiebreaker when enabled.
- **Design docs** in `docs/` (`00` decision log through `07` build plan
  plus the observation log).

### Security / privacy
- Default mode keeps the original prompt text on the local machine. Server
  sync is an explicit opt-in (disabled by v0.1).
- PII masking for emails, Korean RRN, credit cards, phone numbers, AWS /
  Anthropic / OpenAI / GitHub keys, JWTs, and IPv4 addresses.
- `think-prompt wipe --yes` removes all state and hook blocks.

### Known limitations
- macOS + Linux only; Windows support deferred to Phase 2.
- M0 observation spike not yet run against a live Claude Code session; the
  transcript parser operates on heuristic field names and must be validated
  end-to-end (tracked as an issue).
- `@think-prompt/*` packages are not yet published on npm; installation is
  currently source-only via `pnpm install && pnpm -r build`.

[Unreleased]: https://github.com/must-goldenrod/think-prompt/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/must-goldenrod/think-prompt/releases/tag/v0.1.0
