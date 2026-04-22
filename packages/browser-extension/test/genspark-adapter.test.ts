/**
 * jsdom smoke test for the Genspark adapter.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  document.body.replaceChildren();
  (globalThis as any).chrome = {
    runtime: {
      sendMessage: vi.fn((_msg: unknown, cb?: (r: unknown) => void) => cb?.({ ok: true })),
    },
  };
  Object.defineProperty(window, 'performance', {
    value: { timeOrigin: 4444 },
    configurable: true,
  });
  Object.defineProperty(window, 'location', {
    value: { pathname: '/search/gs-7777' },
    writable: true,
  });
});

describe('genspark adapter', () => {
  it('captures a prompt when a button whose text matches /search|send|ask/ is clicked', async () => {
    const ta = document.createElement('textarea');
    ta.value = 'research query on climate';
    document.body.appendChild(ta);

    const btn = document.createElement('button');
    btn.textContent = 'Search';
    document.body.appendChild(btn);

    const mod = await import('../src/content/genspark.js');
    expect(mod.default).toBeTruthy();

    btn.click();

    const sendMessage = (globalThis as any).chrome.runtime.sendMessage as ReturnType<typeof vi.fn>;
    const promptCall = sendMessage.mock.calls.find((c) => (c[0] as any)?.kind === 'prompt');
    expect(promptCall).toBeDefined();
    const msg = promptCall![0] as any;
    expect(msg.payload.source).toBe('genspark');
    expect(msg.payload.prompt_text).toBe('research query on climate');
    expect(msg.payload.browser_session_id).toBe('gs-7777');
  });
});
