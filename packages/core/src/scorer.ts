/**
 * Quality score computation per docs/05-quality-engine.md §3.
 *
 * final_score = 0.7 * rule_score + 0.3 * usage_score  (usage available)
 *             = rule_score                            (no usage yet)
 *
 * If judge_score is present:
 *   final_score = 0.5*rule_score + 0.3*usage_score + 0.2*judge_score
 *   (fallback: 0.6/0.4 without usage)
 */

export const SEVERITY_WEIGHT: Record<number, number> = { 1: 2, 2: 5, 3: 10, 4: 18, 5: 30 };

export interface RuleHitLike {
  severity: number;
}

export function computeRuleScore(hits: RuleHitLike[]): number {
  const penalty = hits.reduce(
    (sum, h) => sum + (SEVERITY_WEIGHT[h.severity as keyof typeof SEVERITY_WEIGHT] ?? 0),
    0
  );
  return Math.max(0, 100 - penalty);
}

export interface UsageMetrics {
  toolCalls: number;
  toolFails: number;
  reuseCount: number; // how many times this prompt_hash seen before in same session
  responseLength: number;
  expectedResponseRange?: { min: number; max: number };
}

export function computeUsageScore(m: UsageMetrics): number | null {
  if (m.toolCalls === 0 && m.responseLength === 0 && m.reuseCount === 0) return null;
  // Fail rate (35%)
  const failRate = m.toolCalls > 0 ? m.toolFails / m.toolCalls : 0;
  const failScore = (1 - failRate) * 100;
  // Reuse (inverse, 25%) — more reuse = lower score
  const reusePenalty = Math.min(1, m.reuseCount / 5);
  const reuseScore = (1 - reusePenalty) * 100;
  // Length fit (15%) — if we have expected range; else neutral 75.
  let lengthScore = 75;
  if (m.expectedResponseRange) {
    const { min, max } = m.expectedResponseRange;
    if (m.responseLength >= min && m.responseLength <= max) lengthScore = 100;
    else if (m.responseLength < min)
      lengthScore = Math.max(0, 100 - ((min - m.responseLength) / min) * 100);
    else lengthScore = Math.max(0, 100 - ((m.responseLength - max) / max) * 100);
  }
  const raw = 0.35 * failScore + 0.25 * reuseScore + 0.15 * lengthScore;
  // Normalize to 0–100 given the 0.75 total weight represented here
  return Math.round(raw / 0.75);
}

export interface ScoreComposition {
  rule_score: number;
  usage_score: number | null;
  judge_score: number | null;
}

export interface ScoreOutcome {
  final_score: number;
  tier: 'good' | 'ok' | 'weak' | 'bad';
}

export function composeFinalScore(s: ScoreComposition): ScoreOutcome {
  let final: number;
  if (s.judge_score != null && s.usage_score != null) {
    final = 0.5 * s.rule_score + 0.3 * s.usage_score + 0.2 * s.judge_score;
  } else if (s.judge_score != null) {
    final = 0.6 * s.rule_score + 0.4 * s.judge_score;
  } else if (s.usage_score != null) {
    final = 0.7 * s.rule_score + 0.3 * s.usage_score;
  } else {
    final = s.rule_score;
  }
  const finalRounded = Math.round(final);
  return { final_score: finalRounded, tier: tierFor(finalRounded) };
}

export function tierFor(score: number): 'good' | 'ok' | 'weak' | 'bad' {
  if (score >= 85) return 'good';
  if (score >= 65) return 'ok';
  if (score >= 45) return 'weak';
  return 'bad';
}
