import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Simple esbuild pipeline for the Think-Prompt browser extension.
// Produces dist/ that can be loaded unpacked in Chrome via chrome://extensions.
//
// Profiles:
//   BUILD_MODE=development (default) — unminified, inline sourcemaps, fast.
//   BUILD_MODE=production            — minified, linked sourcemaps (smaller
//                                       zip + better perf; sourcemap still
//                                       shipped so reviewers can audit).
import { build } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = __dirname;
const dist = join(root, 'dist');

const MODE = process.env.BUILD_MODE === 'production' ? 'production' : 'development';

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const common = {
  bundle: true,
  minify: MODE === 'production',
  sourcemap: MODE === 'production' ? 'linked' : true,
  target: ['es2022'],
  format: 'esm',
  logLevel: 'info',
};

// Background service worker
await build({
  ...common,
  entryPoints: [join(root, 'src/background/index.ts')],
  outfile: join(dist, 'background/index.js'),
  format: 'esm',
});

// Content scripts (one bundle per site adapter)
const adapters = ['chatgpt', 'claude-ai', 'gemini', 'perplexity', 'genspark'];
for (const id of adapters) {
  const entry = join(root, `src/content/${id}.ts`);
  if (!existsSync(entry)) continue;
  await build({
    ...common,
    entryPoints: [entry],
    outfile: join(dist, `content/${id}.js`),
    format: 'iife',
  });
}

// Popup + options
for (const panel of ['popup', 'options']) {
  const entry = join(root, `src/${panel}/${panel}.ts`);
  if (!existsSync(entry)) continue;
  await build({
    ...common,
    entryPoints: [entry],
    outfile: join(dist, `${panel}/${panel}.js`),
    format: 'esm',
  });
  // Copy html
  const html = join(root, `src/${panel}/index.html`);
  if (existsSync(html)) {
    mkdirSync(join(dist, panel), { recursive: true });
    cpSync(html, join(dist, panel, 'index.html'));
  }
}

// Copy manifest + icons + privacy policy + i18n locales.
cpSync(join(root, 'manifest.json'), join(dist, 'manifest.json'));
if (existsSync(join(root, 'public/icons'))) {
  cpSync(join(root, 'public/icons'), join(dist, 'icons'), { recursive: true });
}
if (existsSync(join(root, 'public/privacy-policy.html'))) {
  cpSync(join(root, 'public/privacy-policy.html'), join(dist, 'privacy-policy.html'));
}
if (existsSync(join(root, 'public/_locales'))) {
  cpSync(join(root, 'public/_locales'), join(dist, '_locales'), { recursive: true });
}

// Version sync: pull version from package.json into manifest.json.
try {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const manifestPath = join(dist, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.version = pkg.version;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
} catch {
  // ignore
}

console.log(`Built extension (${MODE}) → dist/`);
