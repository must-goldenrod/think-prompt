/**
 * Runtime message validation: anything that doesn't match the discriminated
 * union must be rejected. Protects the service worker from malformed or
 * cross-extension messages.
 */
import { describe, expect, it } from 'vitest';
import { MAX_PROMPT_CHARS, isValidMessage } from '../src/shared/types.js';

describe('isValidMessage', () => {
  it('accepts well-formed control messages', () => {
    expect(isValidMessage({ kind: 'stats' })).toBe(true);
    expect(isValidMessage({ kind: 'sync-now' })).toBe(true);
    expect(isValidMessage({ kind: 'retry-poisoned' })).toBe(true);
    expect(isValidMessage({ kind: 'clear-all' })).toBe(true);
  });

  it('accepts content-loaded with a string source', () => {
    expect(isValidMessage({ kind: 'content-loaded', source: 'chatgpt' })).toBe(true);
  });

  it('rejects content-loaded without source', () => {
    expect(isValidMessage({ kind: 'content-loaded' })).toBe(false);
  });

  it('accepts a fully populated prompt message', () => {
    expect(
      isValidMessage({
        kind: 'prompt',
        payload: {
          source: 'chatgpt',
          browser_session_id: 's',
          prompt_text: 'hello',
          captured_at: '2026-04-22T00:00:00Z',
        },
      })
    ).toBe(true);
  });

  it('rejects prompt with empty text', () => {
    expect(
      isValidMessage({
        kind: 'prompt',
        payload: {
          source: 'chatgpt',
          browser_session_id: 's',
          prompt_text: '',
          captured_at: 'x',
        },
      })
    ).toBe(false);
  });

  it('rejects prompt exceeding MAX_PROMPT_CHARS', () => {
    expect(
      isValidMessage({
        kind: 'prompt',
        payload: {
          source: 'chatgpt',
          browser_session_id: 's',
          prompt_text: 'x'.repeat(MAX_PROMPT_CHARS + 1),
          captured_at: 'x',
        },
      })
    ).toBe(false);
  });

  it('rejects unknown kind', () => {
    expect(isValidMessage({ kind: 'pwn' })).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(isValidMessage(null)).toBe(false);
    expect(isValidMessage('stats')).toBe(false);
    expect(isValidMessage(42)).toBe(false);
  });
});
