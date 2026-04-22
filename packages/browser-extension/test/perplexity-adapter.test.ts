/**
 * jsdom smoke test for the Perplexity adapter.
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
    value: { timeOrigin: 3333 },
    configurable: true,
  });
  Object.defineProperty(window, 'location', {
    value: { pathname: '/search/pplx-42' },
    writable: true,
  });
});

describe('perplexity adapter', () => {
  it('captures a prompt when a submit-labeled button is clicked', async () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('placeholder', 'Ask anything');
    ta.value = 'what is RAG';
    document.body.appendChild(ta);

    const btn = document.createElement('button');
    btn.setAttribute('aria-label', 'Submit');
    document.body.appendChild(btn);

    const mod = await import('../src/content/perplexity.js');
    expect(mod.default).toBeTruthy();

    btn.click();

    const sendMessage = (globalThis as any).chrome.runtime.sendMessage as ReturnType<typeof vi.fn>;
    const promptCall = sendMessage.mock.calls.find((c) => (c[0] as any)?.kind === 'prompt');
    expect(promptCall).toBeDefined();
    const msg = promptCall![0] as any;
    expect(msg.payload.source).toBe('perplexity');
    expect(msg.payload.prompt_text).toBe('what is RAG');
    expect(msg.payload.browser_session_id).toBe('pplx-42');
  });
});
