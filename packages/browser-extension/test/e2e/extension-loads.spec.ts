/**
 * Smoke E2E: load the unpacked extension in a real Chromium instance and
 * verify the service worker + options page boot without errors.
 *
 * This catches an entire class of regressions the jsdom suite can't:
 *  - manifest.json parse errors
 *  - module-script loading failures in MV3 service workers
 *  - content script syntax errors caught only when Chromium parses them
 *
 * Requires `pnpm exec playwright install chromium` once.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, test } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const EXT_PATH = resolve(dirname(__filename), '..', '..', 'dist');

test.beforeAll(() => {
  if (!existsSync(EXT_PATH)) {
    throw new Error(
      `dist/ not found at ${EXT_PATH} — run \`pnpm -F @think-prompt/browser-extension build\` first`
    );
  }
});

test('extension loads and options page renders', async (_fixtures, testInfo) => {
  testInfo.skip(
    !process.env.PLAYWRIGHT_CHROMIUM_AVAILABLE,
    'Set PLAYWRIGHT_CHROMIUM_AVAILABLE=1 after `playwright install chromium` to run.'
  );

  const userDataDir = await testInfo.outputPath('user-data');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false, // MV3 service workers need a non-headless context
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  try {
    // Wait for the service worker to register.
    let worker = context.serviceWorkers()[0];
    if (!worker) {
      worker = await context.waitForEvent('serviceworker');
    }
    expect(worker.url()).toContain('background/index.js');

    // Open the options page under chrome-extension://<id>/options/index.html
    const extId = new URL(worker.url()).host;
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extId}/options/index.html`);
    await expect(page.locator('h1')).toHaveText(/Think-Prompt for Web/i);
  } finally {
    await context.close();
  }
});
