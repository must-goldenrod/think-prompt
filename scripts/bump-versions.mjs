#!/usr/bin/env node
/**
 * Synchronized version bump for every @think-prompt/* package.
 *
 * Usage:
 *   pnpm run release:bump <new-version>     # e.g. 0.2.0, 1.0.0-rc.1
 *
 * What it does:
 *   1. Validates <new-version> is SemVer (rough check — not a full parser).
 *   2. Rewrites `version` in every publishable package.json under packages/
 *      (core, rules, agent, worker, dashboard, cli).
 *   3. Leaves the root package.json alone — it's private and not published.
 *
 * What it does NOT do:
 *   - git commit, git tag, git push — those stay manual so a maintainer
 *     always eyeballs the diff before tagging.
 *   - regenerate lockfile — pnpm picks up workspace:* resolutions and the
 *     lockfile doesn't encode package versions for workspace packages.
 *
 * The release pipeline (.github/workflows/release.yml) re-verifies that
 * every package.json's `version` matches the pushed tag, so mistakes here
 * fail loudly in CI before anything is published.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLISHED_PACKAGES = ['core', 'rules', 'agent', 'worker', 'dashboard', 'cli'];

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const nextVersion = process.argv[2];
if (!nextVersion) {
  console.error('usage: pnpm run release:bump <new-version>');
  process.exit(2);
}
// Minimal SemVer sanity check: N.N.N with optional -prerelease.
if (!/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(nextVersion)) {
  console.error(
    `error: "${nextVersion}" does not look like a SemVer (expected e.g. 0.2.0, 1.0.0-rc.1)`
  );
  process.exit(2);
}

for (const pkg of PUBLISHED_PACKAGES) {
  const path = join(repoRoot, 'packages', pkg, 'package.json');
  const raw = readFileSync(path, 'utf8');
  const json = JSON.parse(raw);
  const prev = json.version;
  json.version = nextVersion;
  writeFileSync(path, JSON.stringify(json, null, 2) + '\n', 'utf8');
  console.log(`  ${pkg.padEnd(10)} ${prev}  →  ${nextVersion}`);
}

console.log('');
console.log('next steps:');
console.log(`  1. git diff              # eyeball the six version bumps`);
console.log(`  2. update CHANGELOG.md   # add ## [${nextVersion}] section`);
console.log(`  3. git commit -am "release: v${nextVersion}"`);
console.log(`  4. git tag v${nextVersion}`);
console.log(`  5. git push origin main --tags   # triggers .github/workflows/release.yml`);
