# Security Policy

Think-Prompt is a local-first developer tool. Most of its security surface is
**on the user's own machine**: hook scripts that Claude Code invokes, an
HTTP daemon bound to `127.0.0.1`, a SQLite file under `~/.think-prompt/`,
and an optional LLM call to Anthropic when the user explicitly opts in.

We take reports seriously and will respond as quickly as a small team can.

## What counts as a security issue

Please report any of these **privately**:

- **Data leakage** — a code path that sends user prompt text, PII, file
  paths, or API keys anywhere the user did not explicitly authorize
  (anywhere except their own machine or, when opted in for deep analysis,
  Anthropic).
- **PII masking bypass** — a payload that slips past `packages/core/src/pii.ts`
  and reaches a surface intended to hold masked text only (logs,
  dashboard cache, LLM request body).
- **Fail-open violation that causes data loss** — a crash path that
  silently drops collected data instead of preserving it for retry.
- **Hook response injection** — anything that lets a crafted prompt cause
  the agent to inject arbitrary `additionalContext` into Claude Code
  beyond the coach-hint template.
- **Arbitrary file read/write** — a path involving `transcript_path`,
  `~/.claude/projects/`, or the backfill scanner that escapes its
  intended directory tree.
- **CLI command injection** — shell injection via prompt text, session
  IDs, or filenames that flow through `spawn` / `execFileSync`.
- **Supply-chain** — a dependency or build-time script that pulls
  something unexpected during `pnpm install`.

## What does NOT count

- A user's own machine being compromised by other software then reading
  `~/.think-prompt/prompts.db`. That's a local-machine problem, not a
  Think-Prompt vulnerability. (We do, however, document how to wipe the
  directory: `think-prompt wipe --yes`.)
- Anthropic receiving a masked prompt when the user explicitly clicked
  "Run deep analysis" or ran `think-prompt analyze`. That's the
  documented, consent-gated LLM path (D-032/D-033).
- Broken CI, lint warnings, typo fixes — those are regular bugs.

## How to report

**Preferred**: [GitHub Security Advisories — private report](https://github.com/must-goldenrod/think-prompt/security/advisories/new).
Advisories route straight to maintainers, include structured CVE
metadata, and let us coordinate a fix + disclosure without public
exposure.

If you cannot use GitHub Advisories, email the maintainer listed in the
`author` field of `packages/cli/package.json` — but please prefer the
advisory form when possible.

**Please include**:

1. A minimal reproduction (commands, sample prompt, sample JSONL if
   relevant). Reproductions that don't require API keys get faster
   responses.
2. The Think-Prompt version (`think-prompt --version`).
3. Your OS + Node version.
4. Impact in plain words: *what* information leaks *where*, or what an
   attacker could make the tool do.

## What to expect from us

| Step | Target time |
|---|---|
| Acknowledgement of the report | within **3 business days** |
| Initial assessment (confirmed / duplicate / out of scope) | within **7 days** |
| Fix committed to `main` (or a mitigation plan) | within **30 days** for high-severity issues |
| Public advisory + CVE (if applicable) | when a released version ships the fix |

If a report is a duplicate of something already in an advisory, we'll
link you to that advisory and credit you there.

## Supported versions

Until `v1.0.0`, we only patch the **latest published version**. `v0.x`
releases are not separately maintained. If you report an issue against an
older `v0.x.y` we will confirm it still exists on the latest tag before
prioritizing.

## Safe-harbor for researchers

Good-faith research into Think-Prompt's security is welcome. We will not
pursue legal action against researchers who:

- Report issues privately using the process above
- Avoid accessing or exfiltrating other users' data (there is no
  server — this would require compromising someone's machine first, so
  the point is moot in practice)
- Do not destroy data or disrupt service beyond what a reproduction
  demands

Thanks for helping keep Think-Prompt users safe.
