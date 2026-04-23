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
  it('renders overview with data (English locale)', async () => {
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
    const res = await app.inject({ method: 'GET', url: '/?lang=en' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Overview');
    expect(res.body).toContain('Total prompts');
    // Live-refresh bootstrap is injected on the overview.
    expect(res.body).toContain('data-latest-id');
    expect(res.body).toContain('/api/overview/latest-id');
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
    const res = await app.inject({ method: 'GET', url: `/prompts/${u.id}?lang=en` });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Prompt');
    expect(res.body).toContain('fix');
    await app.close();
  });

  it('renders rules catalog (English)', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/rules?lang=en' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Rule catalog');
    expect(res.body).toContain('R001');
    await app.close();
  });

  it('overview shows all 5 tier slots (good/ok/weak/bad/n/a) with English labels', async () => {
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
    const res = await app.inject({ method: 'GET', url: '/?lang=en' });
    expect(res.statusCode).toBe(200);
    for (const tier of ['good', 'ok', 'weak', 'bad', 'n/a']) {
      expect(res.body).toContain(`>${tier}<`);
    }
    expect(res.body).toContain('Tier breakdown');
    // Coach mode card is permanently removed from Overview (was previously
    // a 3rd tile).
    expect(res.body).not.toContain('Coach mode');
    await app.close();
  });

  it('overview renders the stacked-bar chart without the per-day text list', async () => {
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
    const res = await app.inject({ method: 'GET', url: '/?lang=en' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatch(/<svg[\s\S]*?viewBox/);
    expect(res.body).toContain('Daily additions');
    // Per-day text list (e.g. "2026-04-10") was removed at user request —
    // the chart stands alone now. Chart still renders day labels internally
    // via MM/DD format, but the long "<date> · <counts>" rows are gone.
    expect(res.body).not.toContain('border-b border-gray-100 dark:border-zinc-700 last:border-0');
    await app.close();
  });

  it('live-refresh API returns the latest prompt id', async () => {
    const db = openDb();
    upsertSession(db, { id: 's-live', cwd: '/tmp' });
    const u = insertPromptUsage(db, { session_id: 's-live', prompt_text: 'check' });
    db.close();

    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/api/overview/latest-id' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { latestId: string | null };
    expect(body.latestId).toBe(u.id);
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

describe('dashboard period selector (?days=)', () => {
  it('defaults to 30 days when ?days= is missing', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/?lang=en' });
    expect(res.statusCode).toBe(200);
    // The 30d pill should be the one marked active (blue bg), 7d should be inactive.
    expect(res.body).toMatch(/<a href="\/\?lang=en&days=30"[^>]*bg-accent[^>]*>30d<\/a>/);
    expect(res.body).not.toMatch(/<a href="\/\?lang=en&days=7"[^>]*bg-accent[^>]*>7d<\/a>/);
    await app.close();
  });

  it('honours ?days=7 by marking the 7d pill active', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/?lang=en&days=7' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatch(/<a href="\/\?lang=en&days=7"[^>]*bg-accent[^>]*>7d<\/a>/);
    await app.close();
  });

  it('accepts ?days=90 as a valid window', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/?lang=en&days=90' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatch(/<a href="\/\?lang=en&days=90"[^>]*bg-accent[^>]*>90d<\/a>/);
    await app.close();
  });

  it('accepts ?days=365 as a valid window', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/?lang=en&days=365' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatch(/<a href="\/\?lang=en&days=365"[^>]*bg-accent[^>]*>365d<\/a>/);
    await app.close();
  });

  it('accepts ?days=all and caps the window to available data', async () => {
    const db = openDb();
    upsertSession(db, { id: 's-all', cwd: '/tmp' });
    insertPromptUsage(db, { session_id: 's-all', prompt_text: 'ancient' });
    db.close();

    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/?lang=en&days=all' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatch(/<a href="\/\?lang=en&days=all"[^>]*bg-accent[^>]*>all<\/a>/);
    await app.close();
  });

  it('falls back to 30 days when ?days= is garbage', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({
      method: 'GET',
      url: '/?lang=en&days=not-a-number',
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatch(/<a href="\/\?lang=en&days=30"[^>]*bg-accent[^>]*>30d<\/a>/);
    await app.close();
  });

  it('renders all six period options', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/?lang=en' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('>7d<');
    expect(res.body).toContain('>14d<');
    expect(res.body).toContain('>30d<');
    expect(res.body).toContain('>90d<');
    expect(res.body).toContain('>365d<');
    expect(res.body).toContain('>all<');
    await app.close();
  });

  it('translates the "all" pill in Korean', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/?lang=ko&days=all' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('>전체<');
    await app.close();
  });
});

// Brand alignment with site/index.html — shared ink/accent tokens, Inter-ready
// font stack, focus ring, logo dot. See D-037.
describe('dashboard brand tokens', () => {
  it("exposes ink and accent colors in the page's Tailwind config", async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/?lang=en' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("ink: '#0b0d12'");
    expect(res.body).toContain("accent: '#6366f1'");
    await app.close();
  });

  it('declares the sans + mono font family extension to match the site', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/?lang=en' });
    expect(res.body).toContain('Inter');
    expect(res.body).toContain("'SF Mono'");
    await app.close();
  });

  it('uses an accent-coloured focus ring for keyboard users', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/?lang=en' });
    expect(res.body).toMatch(/:focus-visible[\s\S]{0,80}#6366f1/);
    await app.close();
  });

  it('puts an accent dot before the Think-Prompt logo wordmark', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/?lang=en' });
    expect(res.body).toMatch(
      /<span class="inline-block w-2 h-2 rounded-full bg-accent"><\/span>Think-Prompt/
    );
    await app.close();
  });

  it('no longer uses raw Tailwind blue-6xx anywhere in the rendered chrome', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    for (const url of ['/?lang=en', '/prompts?lang=en', '/doctor?lang=en']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.body).not.toMatch(/\b(bg|text|border|hover:bg|hover:text)-blue-\d/);
    }
    await app.close();
  });
});

// Rules catalog is an internal/meta view — hide it from the user-facing nav,
// but keep the route alive so deep-links from README/issues still work.
describe('dashboard nav — rules hidden', () => {
  it('does not link to /rules from the main nav', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/?lang=en' });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toMatch(/<a href="\/rules\?[^"]*"[^>]*>/);
    await app.close();
  });

  it('does not link to /rules from the Korean nav either', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/?lang=ko' });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toMatch(/<a href="\/rules\?[^"]*"[^>]*>/);
    await app.close();
  });

  it('keeps the /rules route reachable by URL for deep-links', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/rules?lang=en' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('R001');
    await app.close();
  });
});

describe('dashboard i18n', () => {
  it('serves Korean chrome when ?lang=ko', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/?lang=ko' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('개요');
    expect(res.body).toContain('전체 프롬프트');
    expect(res.body).toContain('등급 분포');
    expect(res.body).toContain('<html lang="ko">');
    await app.close();
  });

  it('serves Chinese chrome when ?lang=zh', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/?lang=zh' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('概览');
    expect(res.body).toContain('提示总数');
    expect(res.body).toContain('等级分布');
    expect(res.body).toContain('<html lang="zh">');
    await app.close();
  });

  it('serves Spanish chrome when ?lang=es', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/?lang=es' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Resumen');
    expect(res.body).toContain('Total de prompts');
    expect(res.body).toContain('Distribución por nivel');
    expect(res.body).toContain('<html lang="es">');
    await app.close();
  });

  it('serves Japanese chrome when ?lang=ja', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/?lang=ja' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('概要');
    expect(res.body).toContain('プロンプト総数');
    expect(res.body).toContain('品質レベル分布');
    expect(res.body).toContain('<html lang="ja">');
    await app.close();
  });

  it('honours Accept-Language header when no ?lang= override', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({
      method: 'GET',
      url: '/',
      headers: { 'accept-language': 'es-ES,es;q=0.9,en;q=0.8' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Resumen');
    await app.close();
  });

  it('renders a language switcher with all 5 locales', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/?lang=en' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('English');
    expect(res.body).toContain('한국어');
    expect(res.body).toContain('中文');
    expect(res.body).toContain('Español');
    expect(res.body).toContain('日本語');
    await app.close();
  });
});

describe('deep analysis UI (D-033)', () => {
  it('shows a consent banner on prompt detail when deep_consent is pending (default)', async () => {
    const db = openDb();
    upsertSession(db, { id: 's-consent', cwd: '/tmp' });
    const u = insertPromptUsage(db, { session_id: 's-consent', prompt_text: 'ping' });
    db.close();

    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: `/prompts/${u.id}?lang=en` });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Allow deep analysis?');
    expect(res.body).toContain('/settings/consent');
    // With consent pending + LLM off, the run button must NOT appear yet.
    expect(res.body).not.toContain('Run deep analysis');
    await app.close();
  });

  it('POST /settings/consent flips deep_consent and redirects', async () => {
    const db = openDb();
    upsertSession(db, { id: 's-c2', cwd: '/tmp' });
    const u = insertPromptUsage(db, { session_id: 's-c2', prompt_text: 'x' });
    db.close();

    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({
      method: 'POST',
      url: '/settings/consent',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `decision=grant&return_to=/prompts/${u.id}`,
    });
    expect([200, 302]).toContain(res.statusCode);

    const after = await app.inject({
      method: 'GET',
      url: `/prompts/${u.id}?lang=en`,
    });
    // Banner should be gone now.
    expect(after.body).not.toContain('Allow deep analysis?');
    await app.close();
  });

  it('rejects POST /prompts/:id/analyze when consent is not granted', async () => {
    const db = openDb();
    upsertSession(db, { id: 's-c3', cwd: '/tmp' });
    const u = insertPromptUsage(db, { session_id: 's-c3', prompt_text: 'whatever' });
    db.close();

    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({
      method: 'POST',
      url: `/prompts/${u.id}/analyze`,
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('llm is disabled');
    await app.close();
  });
});

describe('renderDailyChart', () => {
  const zeroDay = (
    day: string
  ): {
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
    expect(svg).toMatch(/<text[^>]*>5<\/text>/);
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
    expect(svg).toContain('fill="#22c55e"');
    expect(svg).toContain('fill="#eab308"');
    expect(svg).toContain('fill="#f97316"');
    expect(svg).toContain('fill="#ef4444"');
    expect(svg).toContain('fill="#9ca3af"');
  });

  it('handles empty data (no rows) without throwing', () => {
    const svg = renderDailyChart([]);
    expect(svg).toContain('<svg');
  });

  // Dense mode (>45 bars): x-axis switches from MM/DD per-day labels to one
  // YY-MM label per month boundary, and per-bar total counts disappear —
  // otherwise 90/365/all windows turn the axis into an unreadable blur.
  it('uses monthly YY-MM labels only when the window exceeds 45 days', () => {
    const data = Array.from({ length: 90 }, (_, i) => {
      const dt = new Date(Date.UTC(2026, 0, 15 + i));
      return {
        day: dt.toISOString().slice(0, 10),
        good: 1,
        ok: 0,
        weak: 0,
        bad: 0,
        na: 0,
        total: 1,
      };
    });
    const svg = renderDailyChart(data);
    expect(svg).not.toMatch(/>\d{2}\/\d{2}</);
    expect(svg).toMatch(/>26-01</);
    expect(svg).toMatch(/>26-02</);
    expect(svg).toMatch(/>26-03</);
  });

  it('drops per-bar total labels in dense mode to avoid crowding', () => {
    const data = Array.from({ length: 60 }, (_, i) => {
      const dt = new Date(Date.UTC(2026, 0, 1 + i));
      return {
        day: dt.toISOString().slice(0, 10),
        good: 99,
        ok: 0,
        weak: 0,
        bad: 0,
        na: 0,
        total: 99,
      };
    });
    const svg = renderDailyChart(data);
    expect(svg).not.toContain('font-family="ui-monospace');
  });

  it('keeps MM/DD per-day labels and per-bar totals for short windows (<=45)', () => {
    const data = Array.from({ length: 30 }, (_, i) => {
      const dt = new Date(Date.UTC(2026, 2, 1 + i));
      return {
        day: dt.toISOString().slice(0, 10),
        good: 2,
        ok: 0,
        weak: 0,
        bad: 0,
        na: 0,
        total: 2,
      };
    });
    const svg = renderDailyChart(data);
    expect(svg).toMatch(/>03\/01</);
    expect(svg).toContain('font-family="ui-monospace');
  });
});

// Live-refresh reliability: poll faster, cover more routes, and listen on
// focus/pageshow so throttled background tabs still update promptly.
describe('dashboard live-refresh', () => {
  it('polls every 3 seconds (snappier than the old 6s)', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/?lang=en' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatch(/INTERVAL_MS\s*=\s*3000/);
    await app.close();
  });

  it('listens on focus and pageshow in addition to visibilitychange', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/?lang=en' });
    expect(res.body).toContain("addEventListener('focus'");
    expect(res.body).toContain("addEventListener('pageshow'");
    expect(res.body).toContain("addEventListener('visibilitychange'");
    await app.close();
  });

  it('auto-refreshes on prompt detail pages', async () => {
    const db = openDb();
    upsertSession(db, { id: 's-d', cwd: '/tmp' });
    const u = insertPromptUsage(db, { session_id: 's-d', prompt_text: 'hi' });
    db.close();

    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: `/prompts/${u.id}?lang=en` });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('data-latest-id');
    expect(res.body).toContain('/api/overview/latest-id');
    await app.close();
  });

  it('auto-refreshes on rules catalog', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/rules?lang=en' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('data-latest-id');
    expect(res.body).toContain('/api/overview/latest-id');
    await app.close();
  });

  it('auto-refreshes on doctor page', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/doctor?lang=en' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('data-latest-id');
    expect(res.body).toContain('/api/overview/latest-id');
    await app.close();
  });

  it('does NOT auto-refresh on settings (has edit forms — reload would lose input)', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/settings?lang=en' });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain('/api/overview/latest-id');
    await app.close();
  });
});
