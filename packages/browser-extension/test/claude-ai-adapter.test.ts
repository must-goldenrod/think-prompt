/**
 * jsdom smoke test for the Claude.ai adapter.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { findPromptMessage, setupChromeStub } from './helpers/chrome-stub.js';

let sendMessage: ReturnType<typeof setupChromeStub>;

beforeEach(() => {
  document.body.replaceChildren();
  sendMessage = setupChromeStub('/chat/session-claude-42');
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

    const msg = findPromptMessage(sendMessage);
    expect(msg).toBeDefined();
    expect(msg!.payload.source).toBe('claude-ai');
    expect(msg!.payload.prompt_text).toBe('이 PR 리뷰해줘');
    expect(msg!.payload.browser_session_id).toBe('session-claude-42');
  });
});
