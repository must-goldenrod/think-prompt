import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  insertPromptUsage,
  insertRuleHit,
  openDb,
  upsertQualityScore,
  upsertSession,
} from '@think-prompt/core';
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

  // Detail page coaching layout (D-040 / D-041 — rewrite feature removed).
  it('prompt detail hero shows the big score and tier', async () => {
    const db = openDb();
    upsertSession(db, { id: 's-hero', cwd: '/tmp' });
    const u = insertPromptUsage(db, {
      session_id: 's-hero',
      prompt_text: 'fix it',
    });
    upsertQualityScore(db, {
      usage_id: u.id,
      rule_score: 40,
      final_score: 40,
      tier: 'weak',
      rules_version: 1,
    });
    db.close();

    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: `/prompts/${u.id}?lang=en` });
    expect(res.statusCode).toBe(200);
    // Hero: big 5xl mono score + "/100" microlabel.
    expect(res.body).toMatch(/text-5xl font-mono[\s\S]{0,30}>40</);
    expect(res.body).toContain('/100');
    // D-041: the "think-prompt rewrite" CTA has been removed.
    expect(res.body).not.toContain('think-prompt rewrite');
    await app.close();
  });

  it('prompt detail renders each rule hit as a lesson card with a severity bar', async () => {
    const db = openDb();
    upsertSession(db, { id: 's-cards', cwd: '/tmp' });
    const u = insertPromptUsage(db, {
      session_id: 's-cards',
      prompt_text: '요약 // 번역 // 표로 정리',
    });
    db.close();

    // Write a rule hit directly (the scorer pipeline does this in real use).
    const db2 = openDb();
    insertRuleHit(db2, {
      usage_id: u.id,
      rule_id: 'R004',
      severity: 3,
      message: '여러 태스크가 섞여 있습니다.',
    });
    db2.close();

    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: `/prompts/${u.id}?lang=ko` });
    expect(res.statusCode).toBe(200);
    // Severity ≥ 3 → red accent bar.
    expect(res.body).toMatch(/absolute left-0 top-0 h-full w-1 bg-red-500/);
    // Rule id + SEV pill appear near each other.
    expect(res.body).toContain('R004');
    expect(res.body).toContain('SEV 3');
    // KO locale → lesson example with "약한 예" / "강한 예" labels.
    expect(res.body).toContain('약한 예');
    expect(res.body).toContain('강한 예');
    await app.close();
  });

  it('prompt detail shows the original prompt text in full width (D-041: no rewrite column)', async () => {
    const db = openDb();
    upsertSession(db, { id: 's-two', cwd: '/tmp' });
    const u = insertPromptUsage(db, {
      session_id: 's-two',
      prompt_text: 'this is the original prompt text',
    });
    db.close();

    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: `/prompts/${u.id}?lang=en` });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('this is the original prompt text');
    // D-041: no rewrite column, no "Improved" label, no "No rewrite yet" copy.
    expect(res.body).not.toContain('Improved');
    expect(res.body).not.toContain('No rewrite yet');
    await app.close();
  });

  it('prompt detail collapses the raw meta (session/chars/turn) into <details>', async () => {
    const db = openDb();
    upsertSession(db, { id: 's-meta', cwd: '/tmp' });
    const u = insertPromptUsage(db, { session_id: 's-meta', prompt_text: 'x' });
    db.close();

    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: `/prompts/${u.id}?lang=en` });
    // A <details> wrapper hides the noisy meta block by default.
    expect(res.body).toMatch(/<details[\s\S]{0,200}<summary/);
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
    // Each tier now gets its own KPI tile with the uppercase ASCII label.
    for (const tier of ['GOOD', 'OK', 'WEAK', 'BAD', 'N/A']) {
      expect(res.body).toContain(`>${tier}<`);
    }
    // "Tier breakdown" label is preserved as an aria-label on the tile group
    // (screen-reader accessible, visually implicit via the tier tiles).
    expect(res.body).toContain('Tier breakdown');
    // Coach mode card is permanently removed from Overview (was previously
    // a 3rd tile).
    expect(res.body).not.toContain('Coach mode');
    await app.close();
  });

  it('overview renders Total + 5 tier tiles as one KPI row (big mono numbers)', async () => {
    const db = openDb();
    upsertSession(db, { id: 's-tiles', cwd: '/tmp' });
    for (let i = 0; i < 3; i++) {
      const u = insertPromptUsage(db, {
        session_id: 's-tiles',
        prompt_text: `p${i}`,
      });
      upsertQualityScore(db, {
        usage_id: u.id,
        rule_score: 80,
        final_score: 80,
        tier: 'good',
        rules_version: 1,
      });
    }
    db.close();

    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/?lang=en' });
    expect(res.statusCode).toBe(200);
    // 6-card grid (Total + 5 tiers), each big-number mono tile.
    expect(res.body).toMatch(/lg:grid-cols-6/);
    // Total prompts tile has the big 3xl mono number.
    expect(res.body).toMatch(/Total prompts[\s\S]{0,200}text-3xl font-mono[\s\S]{0,20}>3</);
    // Each tier has its own tile with GOOD/OK/... label above a big number.
    expect(res.body).toMatch(/>GOOD<\/div>[\s\S]{0,100}text-3xl font-mono[\s\S]{0,60}>3</);
    // Each tile shows a percentage subtitle.
    expect(res.body).toMatch(/>100%</);
    // Tier-colored left bar appears per tile.
    expect(res.body).toMatch(/absolute left-0 top-0 h-full w-1 bg-green-500/);
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
    expect(res.body).toContain("accent: '#10b981'");
    expect(res.body).toContain("'#050812'");
    await app.close();
  });

  it('declares the sans + mono font family extension to match the site', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/?lang=en' });
    expect(res.body).toContain('Inter');
    expect(res.body).toContain('JetBrains Mono');
    await app.close();
  });

  it('uses an accent-coloured focus ring for keyboard users', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/?lang=en' });
    expect(res.body).toMatch(/:focus-visible[\s\S]{0,80}#10b981/);
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

// Prompts list — user-facing table layout. See D-036/D-038.
describe('dashboard Prompts table (D-038 UX pass)', () => {
  it('renders Created as the leftmost column and drops the Hits column', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/prompts?lang=en' });
    expect(res.statusCode).toBe(200);
    const thead = res.body.match(/<thead[\s\S]*?<\/thead>/)?.[0] ?? '';
    expect(thead).toMatch(/<th[^>]*>Created<\/th>[\s\S]*<th[^>]*>Score<\/th>/);
    expect(thead).not.toMatch(/>Hits</);
    await app.close();
  });

  it('uses "Search" as the placeholder and submit label (EN)', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/prompts?lang=en' });
    expect(res.body).toMatch(/placeholder="Search"/);
    expect(res.body).toMatch(/<button[^>]*>Search<\/button>/);
    expect(res.body).not.toMatch(/R003/);
    await app.close();
  });

  it('uses localized 검색 for Korean, 搜索 for Chinese', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const ko = await app.inject({ method: 'GET', url: '/prompts?lang=ko' });
    expect(ko.body).toMatch(/placeholder="검색"/);
    const zh = await app.inject({ method: 'GET', url: '/prompts?lang=zh' });
    expect(zh.body).toMatch(/placeholder="搜索"/);
    await app.close();
  });
});

// Tier badge visual — stronger ring + uppercase glyph (D-038).
describe('tier badge visual', () => {
  it('renders the tier label in UPPERCASE ASCII', async () => {
    const db = openDb();
    upsertSession(db, { id: 's-tier', cwd: '/tmp' });
    const u = insertPromptUsage(db, { session_id: 's-tier', prompt_text: 'x' });
    upsertQualityScore(db, {
      usage_id: u.id,
      rule_score: 30,
      final_score: 30,
      tier: 'bad',
      rules_version: 1,
    });
    db.close();

    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/prompts?lang=ko' });
    expect(res.body).toMatch(/<span[^>]*uppercase[^>]*>BAD<\/span>/);
    await app.close();
  });

  it('applies a ring utility for higher scanability', async () => {
    const db = openDb();
    upsertSession(db, { id: 's-ring', cwd: '/tmp' });
    const u = insertPromptUsage(db, { session_id: 's-ring', prompt_text: 'x' });
    upsertQualityScore(db, {
      usage_id: u.id,
      rule_score: 90,
      final_score: 90,
      tier: 'good',
      rules_version: 1,
    });
    db.close();

    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/prompts?lang=en' });
    expect(res.body).toMatch(/ring-1 ring-green-600\/40/);
    await app.close();
  });
});

// Favicon — derived from the marketing-site brand (accent + bar-chart glyph).
// Served as a single SVG to match D-012 (no bundler, no asset pipeline).
describe('dashboard favicon', () => {
  it('serves an SVG favicon on /favicon.svg with the brand accent color', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/favicon.svg' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('image/svg+xml');
    expect(res.body).toContain('<svg');
    expect(res.body).toContain('#10b981');
    await app.close();
  });

  it('sends a long-lived cache header for the favicon so browsers reuse it', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/favicon.svg' });
    expect(res.headers['cache-control']).toMatch(/max-age=\d+/);
    await app.close();
  });

  it('links the favicon from every page <head>', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    for (const url of ['/?lang=en', '/prompts?lang=en', '/doctor?lang=en']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.body).toMatch(/<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg"/);
    }
    await app.close();
  });
});

// Inline improvement hint on Prompts list rows (D-043 → D-046 follow-up).
// D-046: the inline hint now surfaces EVERY rule-hit message verbatim (same
// wording as the detail page's "What went wrong" section), regardless of
// locale. Tier-gated shortTip UX was replaced per user request.
describe('Prompts list · inline hints (full rule messages)', () => {
  async function seedPromptWithHits(
    tier: 'good' | 'ok' | 'weak' | 'bad',
    hits: Array<{ rule_id: string; severity: number; message: string }>
  ): Promise<{ id: string }> {
    const db = openDb();
    upsertSession(db, { id: `s-${tier}`, cwd: '/tmp' });
    const u = insertPromptUsage(db, {
      session_id: `s-${tier}`,
      prompt_text: `prompt tiered ${tier}`,
    });
    upsertQualityScore(db, {
      usage_id: u.id,
      rule_score: tier === 'good' ? 90 : tier === 'ok' ? 70 : tier === 'weak' ? 50 : 30,
      final_score: tier === 'good' ? 90 : tier === 'ok' ? 70 : tier === 'weak' ? 50 : 30,
      tier,
      rules_version: 1,
    });
    for (const h of hits) {
      insertRuleHit(db, { usage_id: u.id, ...h });
    }
    db.close();
    return { id: u.id };
  }

  it('renders EVERY rule-hit message as its own "→ ..." line', async () => {
    // 3 hits → all three messages appear inline, each on its own arrow
    // line, in severity-DESC order. No "+N more" badge — users want the
    // full catalogue visible on the list.
    await seedPromptWithHits('weak', [
      { rule_id: 'R002', severity: 3, message: '출력 형식이 지정되지 않았습니다.' },
      { rule_id: 'R006', severity: 2, message: '성공 기준이 없습니다.' },
      { rule_id: 'R010', severity: 1, message: '출력 제약(길이/언어/범위)이 없습니다.' },
    ]);
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/prompts?lang=ko' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('→ 출력 형식이 지정되지 않았습니다.');
    expect(res.body).toContain('→ 성공 기준이 없습니다.');
    expect(res.body).toContain('→ 출력 제약(길이/언어/범위)이 없습니다.');
    // No "more"-style counter lingering from earlier versions.
    expect(res.body).not.toMatch(/\+\d+ 더/);
    await app.close();
  });

  it('renders a single line with no counter for a single-hit row', async () => {
    await seedPromptWithHits('good', [
      { rule_id: 'R001', severity: 1, message: '프롬프트가 너무 짧습니다.' },
    ]);
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/prompts?lang=ko' });
    expect(res.body).toContain('→ 프롬프트가 너무 짧습니다.');
    expect(res.body).not.toMatch(/\+\d+ 더/);
    await app.close();
  });

  it('orders rule-hit lines by severity DESC (high before low)', async () => {
    // Seed the lower-severity hit first to confirm ordering comes from
    // the query (severity DESC, rule_id ASC), not insertion order.
    await seedPromptWithHits('bad', [
      { rule_id: 'R001', severity: 1, message: 'LOW-SEVERITY-MARKER' },
      { rule_id: 'R004', severity: 4, message: 'HIGH-SEVERITY-MARKER' },
    ]);
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/prompts?lang=ko' });
    const hi = res.body.indexOf('→ HIGH-SEVERITY-MARKER');
    const lo = res.body.indexOf('→ LOW-SEVERITY-MARKER');
    expect(hi).toBeGreaterThan(-1);
    expect(lo).toBeGreaterThan(hi);
    await app.close();
  });

  it('renders messages in every locale (no KO-only gate)', async () => {
    await seedPromptWithHits('weak', [
      { rule_id: 'R002', severity: 3, message: 'Output format not specified.' },
    ]);
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/prompts?lang=en' });
    expect(res.body).toContain('→ Output format not specified.');
    await app.close();
  });

  it('does NOT render an arrow row when a prompt has no rule hits', async () => {
    const db = openDb();
    upsertSession(db, { id: 's-clean', cwd: '/tmp' });
    const u = insertPromptUsage(db, {
      session_id: 's-clean',
      prompt_text: 'clean prompt no hits',
    });
    upsertQualityScore(db, {
      usage_id: u.id,
      rule_score: 95,
      final_score: 95,
      tier: 'good',
      rules_version: 1,
    });
    db.close();

    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/prompts?lang=ko' });
    expect(res.body).not.toContain('→');
    await app.close();
  });
});

// Patterns to watch — Overview Top-5 recurring rule hits (D-044).
describe('Overview · Patterns to watch', () => {
  it('lists top recurring rule_ids sorted by hit count', async () => {
    const db = openDb();
    upsertSession(db, { id: 's-pat', cwd: '/tmp' });
    // Seed: R004 hits 3 prompts, R010 hits 2 prompts, R001 hits 1 prompt.
    // Expected order: R004 > R010 > R001.
    for (let i = 0; i < 3; i++) {
      const u = insertPromptUsage(db, { session_id: 's-pat', prompt_text: `r4-${i}` });
      insertRuleHit(db, { usage_id: u.id, rule_id: 'R004', severity: 3, message: 'm' });
    }
    for (let i = 0; i < 2; i++) {
      const u = insertPromptUsage(db, { session_id: 's-pat', prompt_text: `r10-${i}` });
      insertRuleHit(db, { usage_id: u.id, rule_id: 'R010', severity: 2, message: 'm' });
    }
    const u1 = insertPromptUsage(db, { session_id: 's-pat', prompt_text: 'r1' });
    insertRuleHit(db, { usage_id: u1.id, rule_id: 'R001', severity: 1, message: 'm' });
    db.close();

    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/?lang=ko' });
    expect(res.statusCode).toBe(200);
    // Section heading present (KO).
    expect(res.body).toContain('자주 걸리는 패턴');
    // All three rule ids appear, with R004 before R010 before R001
    // (ordering verified via index-of checks on the body string).
    const idx = (s: string): number => res.body.indexOf(s);
    expect(idx('R004')).toBeGreaterThan(-1);
    expect(idx('R010')).toBeGreaterThan(-1);
    expect(idx('R001')).toBeGreaterThan(-1);
    // Patterns block renders R004 (3 hits) before R010 (2 hits) before R001 (1 hit).
    // Because rule ids also appear elsewhere (e.g. detail deep links), we scope
    // the check to the patterns section's first occurrence.
    const patternsStart = res.body.indexOf('자주 걸리는 패턴');
    const patternsSlice = res.body.slice(patternsStart, patternsStart + 2000);
    expect(patternsSlice.indexOf('R004')).toBeLessThan(patternsSlice.indexOf('R010'));
    expect(patternsSlice.indexOf('R010')).toBeLessThan(patternsSlice.indexOf('R001'));
    await app.close();
  });

  it('shows KO shortTip when locale=ko, falls back to description otherwise', async () => {
    const db = openDb();
    upsertSession(db, { id: 's-patko', cwd: '/tmp' });
    const u = insertPromptUsage(db, { session_id: 's-patko', prompt_text: 'p' });
    insertRuleHit(db, { usage_id: u.id, rule_id: 'R004', severity: 3, message: 'm' });
    db.close();

    const app = buildDashboardServer({ rootOverride: tmp });
    const ko = await app.inject({ method: 'GET', url: '/?lang=ko' });
    // R004 shortTip = "한 번에 한 가지만 부탁하세요."
    expect(ko.body).toContain('한 번에 한 가지만 부탁하세요');
    const en = await app.inject({ method: 'GET', url: '/?lang=en' });
    expect(en.body).toContain('Patterns to watch');
    // EN locale: shortTip skipped → patterns section shows rule description.
    expect(en.body).not.toContain('한 번에 한 가지만');
    await app.close();
  });

  it('shows the empty-state copy when no hits in the 30-day window', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/?lang=ko' });
    expect(res.statusCode).toBe(200);
    // Empty DB → empty-state message visible.
    expect(res.body).toContain('최근 30일 반복 패턴 없음');
    await app.close();
  });
});
