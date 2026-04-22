import { describe, expect, it } from 'vitest';
import { maskPii } from '../src/shared/pii.js';

describe('extension pii masker', () => {
  it('masks email', () => {
    const r = maskPii('reach me at john.doe@example.com please');
    expect(r.masked).toContain('<EMAIL>');
    expect(r.hits.email).toBe(1);
  });

  it('masks Korean phone', () => {
    const r = maskPii('전화 010-1234-5678');
    expect(r.masked).toContain('<PHONE>');
  });

  it('masks international phone (phone_intl)', () => {
    const r = maskPii('call me at +82 10 1234 5678 anytime');
    expect(r.masked).toContain('<PHONE>');
    expect(r.hits.phone_intl ?? r.hits.phone_kr).toBeGreaterThanOrEqual(1);
  });

  it('masks Anthropic key before generic sk-', () => {
    const r = maskPii('key=sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234');
    expect(r.masked).toContain('<ANTHROPIC_KEY>');
    expect(r.hits.openai_key).toBeUndefined();
  });

  it('keeps clean text unchanged', () => {
    const r = maskPii('hello world refactor this function');
    expect(r.masked).toBe('hello world refactor this function');
  });
});
