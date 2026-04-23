# Changelog

All notable changes to Think-Prompt follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

During the `0.x` series breaking changes may occur in any minor release; the
stability guarantees of v1.0 do not yet apply.

## [Unreleased]

_No unreleased changes._

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
