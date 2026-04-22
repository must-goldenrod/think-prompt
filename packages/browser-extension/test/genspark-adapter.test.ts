/**
 * jsdom smoke test for the Genspark adapter.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { findPromptMessage, setupChromeStub } from './helpers/chrome-stub.js';

let sendMessage: ReturnType<typeof setupChromeStub>;

beforeEach(() => {
  document.body.replaceChildren();
  sendMessage = setupChromeStub('/search/gs-7777');
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

    const msg = findPromptMessage(sendMessage);
    expect(msg).toBeDefined();
    expect(msg!.payload.source).toBe('genspark');
    expect(msg!.payload.prompt_text).toBe('research query on climate');
    expect(msg!.payload.browser_session_id).toBe('gs-7777');
  });
});
