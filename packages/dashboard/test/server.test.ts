import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { insertPromptUsage, openDb, upsertQualityScore, upsertSession } from '@think-prompt/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderDailyChart } from '../src/html.js';
import { buildDashboardServer } from '../src/server.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'pp-dash-'));
  process.env.THINK_PROMPT_HOME = tmp;
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  delete process.env.THINK_PROMPT_HOME;
});

describe('dashboard', () => {
  it('renders overview with data', async () => {
    const db = openDb();
    upsertSession(db, { id: 's1', cwd: '/tmp' });
    const u = insertPromptUsage(db, { session_id: 's1', prompt_text: 'hello world' });
    upsertQualityScore(db, {
      usage_id: u.id,
      rule_score: 80,
      final_score: 80,
      tier: 'ok',
      rules_version: 1,
    });
    db.close();

    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Overview');
    expect(res.body).toContain('Total prompts');
    await app.close();
  });

  it('renders prompt detail', async () => {
    const db = openDb();
    upsertSession(db, { id: 's1', cwd: '/tmp' });
    const u = insertPromptUsage(db, { session_id: 's1', prompt_text: 'fix' });
    upsertQualityScore(db, {
      usage_id: u.id,
      rule_score: 50,
      final_score: 50,
      tier: 'weak',
      rules_version: 1,
    });
    db.close();

    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: `/prompts/${u.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Prompt');
    expect(res.body).toContain('fix');
    await app.close();
  });

  it('renders rules catalog', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/rules' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Rule catalog');
    expect(res.body).toContain('R001');
    await app.close();
  });

  it('overview shows all 4 tiers (good/ok/weak/bad) even when counts are 0', async () => {
    // Seed one 'ok' prompt — other tiers should still render as 0, not be hidden.
    const db = openDb();
    upsertSession(db, { id: 's-tiers', cwd: '/tmp' });
    const u = insertPromptUsage(db, { session_id: 's-tiers', prompt_text: 'hello' });
    upsertQualityScore(db, {
      usage_id: u.id,
      rule_score: 80,
      final_score: 80,
      tier: 'ok',
      rules_version: 1,
    });
    db.close();

    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    // All 4 tier labels must appear in the breakdown, plus the 'n/a' (unscored).
    for (const tier of ['good', 'ok', 'weak', 'bad', 'n/a']) {
      expect(res.body).toContain(`>${tier}<`);
    }
    // Total line is exposed.
    expect(res.body).toContain('Tier breakdown');
    // Coach mode card must NOT be rendered on the overview anymore.
    expect(res.body).not.toContain('Coach mode');
    await app.close();
  });

  it('overview renders the daily stacked-bar chart (SVG)', async () => {
    const db = openDb();
    upsertSession(db, { id: 's-chart', cwd: '/tmp' });
    const u = insertPromptUsage(db, { session_id: 's-chart', prompt_text: 'hi' });
    upsertQualityScore(db, {
      usage_id: u.id,
      rule_score: 70,
      final_score: 70,
      tier: 'ok',
      rules_version: 1,
    });
    db.close();

    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    // SVG container is present.
    expect(res.body).toMatch(/<svg[\s\S]*?viewBox/);
    // Heading + window total line.
    expect(res.body).toContain('Daily additions');
    await app.close();
  });

  it('records feedback via POST /prompts/:id/feedback', async () => {
    const db = openDb();
    upsertSession(db, { id: 's-fb', cwd: '/tmp' });
    const u = insertPromptUsage(db, { session_id: 's-fb', prompt_text: 'fix' });
    db.close();

    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({
      method: 'POST',
      url: `/prompts/${u.id}/feedback`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'rating=up',
    });
    expect([200, 302]).toContain(res.statusCode);

    const db2 = openDb();
    const count = db2
      .prepare(`SELECT COUNT(*) AS c FROM outcomes WHERE usage_id=? AND rating='up'`)
      .get(u.id) as { c: number };
    expect(count.c).toBe(1);
    db2.close();
    await app.close();
  });
});

describe('renderDailyChart', () => {
  const zeroDay = (day: string): {
    day: string;
    good: number;
    ok: number;
    weak: number;
    bad: number;
    na: number;
    total: number;
  } => ({ day, good: 0, ok: 0, weak: 0, bad: 0, na: 0, total: 0 });

  it('returns an SVG with viewBox, gridlines and legend', () => {
    const data = [
      { ...zeroDay('2026-04-10'), good: 3, total: 3 },
      { ...zeroDay('2026-04-11'), ok: 2, bad: 1, total: 3 },
    ];
    const svg = renderDailyChart(data);
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox');
    // Gridline labels exist (niceCeil(3) = 5).
    expect(svg).toMatch(/<text[^>]*>5<\/text>/);
    // Legend labels for ALL 5 statuses.
    for (const label of ['good', 'ok', 'weak', 'bad', 'n/a']) {
      expect(svg).toContain(`>${label}<`);
    }
  });

  it('labels each non-zero day with its total above the bar', () => {
    const data = [
      { ...zeroDay('2026-04-10'), good: 3, total: 3 },
      { ...zeroDay('2026-04-11'), ok: 7, total: 7 },
    ];
    const svg = renderDailyChart(data);
    expect(svg).toMatch(/<text[^>]*>3<\/text>/);
    expect(svg).toMatch(/<text[^>]*>7<\/text>/);
  });

  it('colors segments by tier with the expected palette', () => {
    const data = [{ ...zeroDay('2026-04-10'), good: 1, ok: 1, weak: 1, bad: 1, na: 1, total: 5 }];
    const svg = renderDailyChart(data);
    expect(svg).toContain('fill="#22c55e"'); // good  (green)
    expect(svg).toContain('fill="#eab308"'); // ok    (yellow)
    expect(svg).toContain('fill="#f97316"'); // weak  (orange)
    expect(svg).toContain('fill="#ef4444"'); // bad   (red)
    expect(svg).toContain('fill="#9ca3af"'); // n/a   (gray)
  });

  it('handles empty data (no rows) without throwing', () => {
    const svg = renderDailyChart([]);
    expect(svg).toContain('<svg');
  });
});
