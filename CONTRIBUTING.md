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

1. Update `CHANGELOG.md` under the new version.
2. Bump versions in each `packages/*/package.json`.
3. Tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.
4. `gh release create vX.Y.Z --notes-file ...` (or let CI handle it).

## Code of Conduct

Participation in this project is governed by
[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
