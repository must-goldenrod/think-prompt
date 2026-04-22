/**
 * jsdom smoke test for the Gemini adapter.
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
    value: { timeOrigin: 2222 },
    configurable: true,
  });
  Object.defineProperty(window, 'location', {
    value: { pathname: '/app/gemini-abc-999' },
    writable: true,
  });
});

describe('gemini adapter', () => {
  it('captures a prompt when a Send-labeled button is clicked', async () => {
    const wrapper = document.createElement('rich-textarea');
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    editor.className = 'ql-editor';
    editor.textContent = 'summarize this paper';
    wrapper.appendChild(editor);
    document.body.appendChild(wrapper);

    const btn = document.createElement('button');
    btn.setAttribute('aria-label', 'Send message');
    document.body.appendChild(btn);

    const mod = await import('../src/content/gemini.js');
    expect(mod.default).toBeTruthy();

    btn.click();

    const sendMessage = (globalThis as any).chrome.runtime.sendMessage as ReturnType<typeof vi.fn>;
    const promptCall = sendMessage.mock.calls.find((c) => (c[0] as any)?.kind === 'prompt');
    expect(promptCall).toBeDefined();
    const msg = promptCall![0] as any;
    expect(msg.payload.source).toBe('gemini');
    expect(msg.payload.prompt_text).toBe('summarize this paper');
    expect(msg.payload.browser_session_id).toBe('gemini-abc-999');
  });
});
