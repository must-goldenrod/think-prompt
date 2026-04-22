import { spawnSync } from 'node:child_process';
/**
 * Produce a Chrome Web Store-ready .zip of dist/.
 *
 * Uses the system `zip` CLI — ubiquitous on macOS/Linux, and available on
 * Windows 10+ via `tar`/`Compress-Archive` too. We prefer `zip -r` for a
 * flat, reproducible layout that matches what the unpacked loader sees.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const root = join(dirname(__filename), '..');
const dist = join(root, 'dist');

if (!existsSync(dist)) {
  console.error(`dist/ not found at ${dist} — run build first`);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const outName = `think-prompt-extension-v${pkg.version}.zip`;
const outPath = join(root, outName);

rmSync(outPath, { force: true });

const res = spawnSync('zip', ['-rq', outPath, '.'], { cwd: dist, stdio: 'inherit' });
if (res.status !== 0) {
  console.error('zip failed — is the `zip` CLI available on PATH?');
  process.exit(res.status ?? 1);
}

console.log(`Packaged → ${outPath}`);
