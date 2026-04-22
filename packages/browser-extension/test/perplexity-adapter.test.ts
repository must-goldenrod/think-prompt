/**
 * jsdom smoke test for the Perplexity adapter.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { findPromptMessage, setupChromeStub } from './helpers/chrome-stub.js';

let sendMessage: ReturnType<typeof setupChromeStub>;

beforeEach(() => {
  document.body.replaceChildren();
  sendMessage = setupChromeStub('/search/pplx-42');
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

    const msg = findPromptMessage(sendMessage);
    expect(msg).toBeDefined();
    expect(msg!.payload.source).toBe('perplexity');
    expect(msg!.payload.prompt_text).toBe('what is RAG');
    expect(msg!.payload.browser_session_id).toBe('pplx-42');
  });
});
