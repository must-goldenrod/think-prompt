# think-prompt — absorbed into claude-alive

> 📦 **This repository is archived.** The think-prompt engine (agent, worker,
> rules, core, CLI) has been folded into [**claude-alive**](https://github.com/must-goldenrod/claude-alive)
> and is now developed there. The standalone `think-prompt` npm package is
> deprecated.

---

## What happened

think-prompt and claude-alive shared the same user (a Claude Code developer)
and lived next to each other on disk anyway. After the dashboard surface was
rewritten in React inside claude-alive (the **Prompt** tab), the two
projects no longer benefited from being separate repos. claude-alive
absorbed think-prompt's packages on **2026-05-12** (D-048).

| Old (think-prompt monorepo)        | New (claude-alive monorepo)           |
|------------------------------------|----------------------------------------|
| `packages/core` (`@think-prompt/core`)     | `packages/prompt-core`         |
| `packages/rules` (`@think-prompt/rules`)   | `packages/prompt-rules`        |
| `packages/agent` (`@think-prompt/agent`)   | `packages/prompt-agent`        |
| `packages/worker` (`@think-prompt/worker`) | `packages/prompt-worker`       |
| `packages/cli` (`think-prompt` binary)     | `packages/prompt-cli` (library only) |
| `packages/dashboard` (`@think-prompt/dashboard`) | **dropped** — replaced by claude-alive React Prompt tab |

Package names inside the workspace (`@think-prompt/core`, `@think-prompt/rules`,
`@think-prompt/agent`, `@think-prompt/worker`) are unchanged so imports keep
working. The user-facing CLI is now `claude-alive` (which orchestrates the
absorbed engine internally).

## Migration

Existing installs continue to work — the SQLite database at
`~/.think-prompt/prompts.db` and the agent at `127.0.0.1:47823` are
preserved, including all collected prompts, scores, and rule hits.

To switch to the new combined product:

```bash
# (optional) Remove the deprecated standalone install:
npm uninstall -g think-prompt

# Install the absorbed product:
npm install -g claude-alive
claude-alive install   # registers hooks + starts agent + worker
claude-alive start     # launches the dashboard at http://localhost:3141
```

The `Prompt` tab inside the claude-alive dashboard renders the same data
the old `127.0.0.1:47824` dashboard used to render, plus the D-046 4-tuple
(confidence + baseline delta + efficiency).

## Why archive instead of unpublish

npm packages with even one download are protected from unpublish to avoid
breaking downstream consumers. Per npm download data, lifetime installs are
just 248 (the vast majority concentrated on the original release day), but
those installs still matter — they get a deprecation warning pointing to
this notice instead of a hard 404.

## Historical artifacts

- **Decision log** (`docs/00-decision-log.md`) — preserved here for the
  D-001…D-047 entries that predate absorption. D-048 (the absorption
  decision itself) lives in claude-alive's own decision log.
- **CHANGELOG.md** — preserved here for the v0.1.0…v0.6.0 history.
- **REPORT.md** / **CONTRIBUTING.md** / etc. — preserved for archaeological
  purposes; design choices that survived absorption are now governed by
  claude-alive's contribution guidelines.

## Where to file issues

→ https://github.com/must-goldenrod/claude-alive/issues

The think-prompt issue tracker is disabled along with the repo archive.
