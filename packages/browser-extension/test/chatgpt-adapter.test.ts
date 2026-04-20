/**
 * jsdom-based smoke test for the ChatGPT content-script adapter.
 * We set up a minimal DOM that resembles chatgpt.com (`#prompt-textarea` +
 * send button), then trigger a send and assert our adapter captures the
 * right text. `chrome.runtime.sendMessage` is stubbed to a vi.fn().
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  document.body.innerHTML = '';
  (globalThis as any).chrome = {
    runtime: {
      sendMessage: vi.fn((_msg: unknown, cb?: (r: unknown) => void) => cb?.({ ok: true })),
    },
  };
  Object.defineProperty(window, 'performance', {
    value: { timeOrigin: 1234567890 },
    configurable: true,
  });
  // jsdom default location is about:blank
  Object.defineProperty(window, 'location', {
    value: { pathname: '/c/test-session-abc' },
    writable: true,
  });
});

describe('chatgpt adapter', () => {
  it('captures a prompt on send-button click', async () => {
    // Build a textarea + send button like chatgpt.com
    const ta = document.createElement('textarea');
    ta.id = 'prompt-textarea';
    ta.value = '이 코드 좀 봐줘';
    document.body.appendChild(ta);
    const btn = document.createElement('button');
    btn.setAttribute('data-testid', 'send-button');
    document.body.appendChild(btn);

    // Load the adapter AFTER the DOM exists so activate() binds correctly.
    const mod = await import('../src/content/chatgpt.js');
    expect(mod.default).toBeTruthy();

    btn.click();

    const sendMessage = (globalThis as any).chrome.runtime.sendMessage as ReturnType<typeof vi.fn>;
    expect(sendMessage).toHaveBeenCalled();
    const [msg] = sendMessage.mock.calls[0]!;
    expect(msg.kind).toBe('prompt');
    expect(msg.payload.source).toBe('chatgpt');
    expect(msg.payload.prompt_text).toBe('이 코드 좀 봐줘');
    expect(msg.payload.browser_session_id).toBe('test-session-abc');
  });
});
