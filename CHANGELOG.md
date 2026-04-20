# Changelog

All notable changes to Think-Prompt follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

During the `0.x` series breaking changes may occur in any minor release; the
stability guarantees of v1.0 do not yet apply.

## [Unreleased]

### To verify
- **M0 observation spike** — confirm Claude Code hook payloads and
  `transcript.jsonl` field names against the assumptions encoded in
  `packages/core/src/schema.ts` and `packages/core/src/transcript/parser.ts`.
  See `docs/99-observation-log.md` for the 10 open questions.

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
