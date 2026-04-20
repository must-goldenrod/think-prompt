import { describe, expect, it } from 'vitest';
import { composeFinalScore, computeRuleScore, computeUsageScore, tierFor } from '../src/scorer.js';

describe('computeRuleScore', () => {
  it('100 when no hits', () => {
    expect(computeRuleScore([])).toBe(100);
  });
  it('subtracts per severity weight', () => {
    expect(computeRuleScore([{ severity: 3 }])).toBe(90);
    expect(computeRuleScore([{ severity: 3 }, { severity: 2 }])).toBe(85);
    expect(computeRuleScore([{ severity: 5 }, { severity: 5 }, { severity: 5 }])).toBe(10);
  });
  it('floors at 0', () => {
    expect(computeRuleScore(Array(10).fill({ severity: 5 }))).toBe(0);
  });
});

describe('computeUsageScore', () => {
  it('null when no signals', () => {
    expect(
      computeUsageScore({ toolCalls: 0, toolFails: 0, reuseCount: 0, responseLength: 0 })
    ).toBeNull();
  });
  it('penalizes failure rate', () => {
    const noFail = computeUsageScore({
      toolCalls: 10,
      toolFails: 0,
      reuseCount: 0,
      responseLength: 100,
    });
    const someFail = computeUsageScore({
      toolCalls: 10,
      toolFails: 5,
      reuseCount: 0,
      responseLength: 100,
    });
    expect(noFail).toBeGreaterThan(someFail!);
  });
});

describe('composeFinalScore', () => {
  it('uses rule_score when no other signals', () => {
    expect(composeFinalScore({ rule_score: 80, usage_score: null, judge_score: null })).toEqual({
      final_score: 80,
      tier: 'ok',
    });
  });
  it('mixes rule + usage', () => {
    const r = composeFinalScore({ rule_score: 80, usage_score: 60, judge_score: null });
    expect(r.final_score).toBe(Math.round(0.7 * 80 + 0.3 * 60));
  });
  it('includes judge when present', () => {
    const r = composeFinalScore({ rule_score: 80, usage_score: 60, judge_score: 70 });
    expect(r.final_score).toBe(Math.round(0.5 * 80 + 0.3 * 60 + 0.2 * 70));
  });
});

describe('tierFor', () => {
  it('maps to tiers', () => {
    expect(tierFor(95)).toBe('good');
    expect(tierFor(70)).toBe('ok');
    expect(tierFor(50)).toBe('weak');
    expect(tierFor(30)).toBe('bad');
  });
});
