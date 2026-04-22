/**
 * Verifies that the per-site on/off toggle actually gates capture.
 * Before v0.3.1 the Options page wrote this key but nothing read it,
 * so it was silently a no-op — a privacy policy violation.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetToggleCacheForTests, isSiteEnabled } from '../src/background/site-toggle.js';

const STORAGE_KEY = 'think-prompt:sites';

interface ChromeStorageStub {
  storage: {
    local: { get: ReturnType<typeof vi.fn> };
    onChanged: { addListener: ReturnType<typeof vi.fn> };
  };
}

function setChromeStub(stub: ChromeStorageStub): void {
  (globalThis as unknown as { chrome: ChromeStorageStub }).chrome = stub;
}

function stubStorage(value: unknown): void {
  setChromeStub({
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: value })),
      },
      onChanged: { addListener: vi.fn() },
    },
  });
}

beforeEach(() => {
  __resetToggleCacheForTests();
});

describe('site toggle', () => {
  it('treats missing entries as enabled (opt-out model)', async () => {
    stubStorage(undefined);
    await expect(isSiteEnabled('chatgpt')).resolves.toBe(true);
  });

  it('returns false when the user explicitly toggled the site off', async () => {
    stubStorage({ chatgpt: false, 'claude-ai': true });
    await expect(isSiteEnabled('chatgpt')).resolves.toBe(false);
  });

  it('returns true when storage has an empty record', async () => {
    stubStorage({});
    await expect(isSiteEnabled('gemini')).resolves.toBe(true);
  });

  it('returns true when storage access throws', async () => {
    setChromeStub({
      storage: {
        local: {
          get: vi.fn(async () => {
            throw new Error('denied');
          }),
        },
        onChanged: { addListener: vi.fn() },
      },
    });
    await expect(isSiteEnabled('perplexity')).resolves.toBe(true);
  });

  it('caches the result — repeated calls hit storage once', async () => {
    stubStorage({ chatgpt: false });
    await isSiteEnabled('chatgpt');
    await isSiteEnabled('chatgpt');
    await isSiteEnabled('claude-ai');
    const getMock = (globalThis as unknown as { chrome: ChromeStorageStub }).chrome.storage.local
      .get as ReturnType<typeof vi.fn>;
    expect(getMock).toHaveBeenCalledTimes(1);
  });
});
