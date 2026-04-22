# Contributing to Think-Prompt

Thanks for your interest. Think-Prompt is a **local-first** tool, and contributions
are welcome — whether that is a bug report, a rule tweak, a new LLM adapter,
or documentation.

## Quick start

```bash
pnpm install
pnpm run ci            # typecheck + lint + test + build
```

- **Node 20 LTS or newer** (development happens on 22).
- **pnpm 10+.** The `packageManager` field pins the exact version.
- **macOS or Linux.** Windows is not yet supported.

## Workflow

1. Open an issue describing what you want to change (or pick an existing one).
2. Fork, branch, commit. Follow **Conventional Commits** (`feat:`, `fix:`,
   `docs:`, `chore:`, `refactor:`, `test:`).
3. Make sure `pnpm run ci` passes locally. Add or update tests.
4. Open a PR against `main`. Fill in the PR template. Link the issue.
5. A maintainer reviews; CI must be green before merge.

### Scope

- **v0.x is allowed to ship breaking changes** but they should appear in the
  changelog and in the PR description.
- The [Decision log](./docs/00-decision-log.md) captures product-level
  decisions — if a PR contradicts one, call it out explicitly (it may require
  superseding that decision).
- Anything that affects how prompts are collected, stored, masked, or shared
  must respect the privacy principles in `docs/00-decision-log.md` D-004 and
  D-030.

## Where to look

| Task | Package | Key files |
|---|---|---|
| Add a new rule | `packages/rules` | `src/rules.ts`, `src/keywords.ts`, tests |
| Change the score formula | `packages/core` | `src/scorer.ts`, `test/scorer.test.ts` |
| Add a new hook route | `packages/agent` | `src/server.ts` |
| Add a CLI subcommand | `packages/cli` | `src/commands/*`, `src/index.ts` |
| Change dashboard UI | `packages/dashboard` | `src/server.ts`, `src/html.ts` |
| Add a background job | `packages/worker` | `src/jobs.ts` |

## Coding style

- TypeScript `strict` + `exactOptionalPropertyTypes`. Prefer narrow types to
  `any`.
- Biome handles lint and format. Run `pnpm lint:fix` before pushing.
- Keep daemons **fail-open** (`docs/00-decision-log.md` D-028). Think-Prompt
  must never block Claude Code because it crashed.

## Tests

- Every new rule must ship positive and negative samples.
- Every new CLI subcommand that reads from disk must have a settings-merge or
  integration-style test.
- Vitest is scoped per package; run the whole suite with `pnpm test`.

## Releasing (maintainers only)

Publishing is automated end-to-end: a pushed `vX.Y.Z` tag triggers
`.github/workflows/release.yml`, which rebuilds, re-tests, verifies the
tag matches every package's `version`, publishes the six
`@think-prompt/*` packages to npm with provenance, and drafts a GitHub
Release from the matching `CHANGELOG.md` section.

### Steps

```bash
# 1. Sync all six package.json files to the target SemVer.
#    (Edits packages/*/package.json only; root stays private.)
pnpm run release:bump 0.2.0

# 2. Optional sanity check — produces tarballs under ./.dry-publish/ that
#    mirror what CI would publish. Open a few to confirm dist/ files, types,
#    and metadata look right before tagging.
pnpm run release:dry

# 3. Add the new `## [0.2.0] - <date>` section to CHANGELOG.md with a
#    human-readable summary; the release workflow extracts this section
#    verbatim into the GitHub Release notes.

# 4. Commit, tag, push.
git commit -am "release: v0.2.0"
git tag v0.2.0
git push origin main --tags
```

### Prerequisites (one-time, maintainer account)

- `NPM_TOKEN` secret on the repo — an npm automation token with publish
  rights on the `@think-prompt` org.
- Repo must allow GitHub Actions to request OIDC tokens (for npm
  provenance); defaults to allowed on public repos.

### What the workflow guarantees

- Refuses to publish if any `packages/*/package.json` version disagrees
  with the pushed tag.
- Re-runs the full CI gate (build → typecheck → lint → test) on the
  exact tag commit.
- Signs each tarball with a provenance attestation, so the npm page
  shows "Built and signed on GitHub Actions" with a link back to the
  workflow run.

### What the workflow does NOT do

- Bump versions for you — `pnpm run release:bump` is manual so the
  maintainer eyeballs the diff before tagging.
- Write CHANGELOG entries — still a human job.
- Publish prereleases under a non-`latest` tag — if that's needed,
  extend the workflow with a `--tag` arg driven by the tag name
  (e.g. `v0.2.0-rc.1` → `--tag next`).

## Code of Conduct

Participation in this project is governed by
[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
