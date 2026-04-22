/**
 * jsdom smoke test for the Claude.ai adapter.
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
    value: { timeOrigin: 1111 },
    configurable: true,
  });
  Object.defineProperty(window, 'location', {
    value: { pathname: '/chat/session-claude-42' },
    writable: true,
  });
});

describe('claude-ai adapter', () => {
  it('captures a prompt when the Send Message button is clicked', async () => {
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    editor.className = 'ProseMirror';
    editor.textContent = '이 PR 리뷰해줘';
    document.body.appendChild(editor);

    const btn = document.createElement('button');
    btn.setAttribute('aria-label', 'Send Message');
    document.body.appendChild(btn);

    const mod = await import('../src/content/claude-ai.js');
    expect(mod.default).toBeTruthy();

    btn.click();

    const sendMessage = (globalThis as any).chrome.runtime.sendMessage as ReturnType<typeof vi.fn>;
    const promptCall = sendMessage.mock.calls.find((c) => (c[0] as any)?.kind === 'prompt');
    expect(promptCall).toBeDefined();
    const msg = promptCall![0] as any;
    expect(msg.payload.source).toBe('claude-ai');
    expect(msg.payload.prompt_text).toBe('이 PR 리뷰해줘');
    expect(msg.payload.browser_session_id).toBe('session-claude-42');
  });
});
