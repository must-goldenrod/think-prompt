/**
 * jsdom smoke test for the Gemini adapter.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { findPromptMessage, setupChromeStub } from './helpers/chrome-stub.js';

let sendMessage: ReturnType<typeof setupChromeStub>;

beforeEach(() => {
  document.body.replaceChildren();
  sendMessage = setupChromeStub('/app/gemini-abc-999');
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

    const msg = findPromptMessage(sendMessage);
    expect(msg).toBeDefined();
    expect(msg!.payload.source).toBe('gemini');
    expect(msg!.payload.prompt_text).toBe('summarize this paper');
    expect(msg!.payload.browser_session_id).toBe('gemini-abc-999');
  });
});
