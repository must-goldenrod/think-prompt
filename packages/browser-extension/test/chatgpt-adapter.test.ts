/**
 * jsdom-based smoke test for the ChatGPT content-script adapter.
 * We set up a minimal DOM that resembles chatgpt.com (`#prompt-textarea` +
 * send button), then trigger a send and assert our adapter captures the
 * right text.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { findPromptMessage, setupChromeStub } from './helpers/chrome-stub.js';

let sendMessage: ReturnType<typeof setupChromeStub>;

beforeEach(() => {
  document.body.replaceChildren();
  sendMessage = setupChromeStub('/c/test-session-abc');
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

    expect(sendMessage).toHaveBeenCalled();
    const msg = findPromptMessage(sendMessage);
    expect(msg).toBeDefined();
    expect(msg!.payload.source).toBe('chatgpt');
    expect(msg!.payload.prompt_text).toBe('이 코드 좀 봐줘');
    expect(msg!.payload.browser_session_id).toBe('test-session-abc');
  });
});
