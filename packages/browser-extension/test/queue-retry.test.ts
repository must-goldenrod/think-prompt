/**
 * Unit tests for the retry-cap logic in the IndexedDB queue. The predicate
 * governs whether drainPending() will pick a row up — mis-reading it would
 * mean poisoned rows get retried forever (P2-9).
 */
import { describe, expect, it } from 'vitest';
import { MAX_ATTEMPTS, type QueueRow, isRowRetriable } from '../src/background/queue.js';

function row(partial: Partial<QueueRow>): QueueRow {
  return {
    id: 'x',
    source: 'chatgpt',
    browser_session_id: 'b',
    prompt_text: 'hi',
    pii_masked: 'hi',
    pii_hits: {},
    created_at: '2026-04-22T00:00:00Z',
    synced: false,
    attempts: 0,
    ...partial,
  };
}

describe('queue retry predicate', () => {
  it('retriable when fresh', () => {
    expect(isRowRetriable(row({}))).toBe(true);
  });

  it('not retriable once synced', () => {
    expect(isRowRetriable(row({ synced: true }))).toBe(false);
  });

  it('not retriable once poisoned', () => {
    expect(isRowRetriable(row({ poisoned: true }))).toBe(false);
  });

  it(`not retriable at ${MAX_ATTEMPTS} attempts`, () => {
    expect(isRowRetriable(row({ attempts: MAX_ATTEMPTS }))).toBe(false);
  });

  it(`retriable at ${MAX_ATTEMPTS - 1} attempts`, () => {
    expect(isRowRetriable(row({ attempts: MAX_ATTEMPTS - 1 }))).toBe(true);
  });
});
