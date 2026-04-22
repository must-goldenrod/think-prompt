import { defineConfig } from '@playwright/test';

/**
 * Playwright config for the browser extension.
 *
 * The E2E suite loads the built `dist/` directory as an unpacked extension
 * via `chromium.launchPersistentContext`. Run with:
 *
 *   pnpm -F @think-prompt/browser-extension build
 *   pnpm -F @think-prompt/browser-extension e2e
 *
 * The chromium binary is NOT installed on `pnpm install` — call
 * `pnpm exec playwright install chromium` once before the first run.
 */
export default defineConfig({
  testDir: './test/e2e',
  timeout: 30_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    headless: true,
  },
});
