import {
  type Config,
  type DeepAnalysisRow,
  createLogger,
  getDeepAnalyses,
  getOutcomeTotals,
  getPaths,
  loadConfig,
  openDb,
  recordOutcome,
  runDeepAnalysis,
  saveConfig,
  setConfigValue,
} from '@think-prompt/core';
import { getRulesCatalog } from '@think-prompt/rules';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import {
  escapeHtml,
  layout,
  renderDailyChart,
  renderDeepAnalysisSection,
  tierBadge,
} from './html.js';
import { type Locale, resolveLocale, t } from './i18n.js';
import { getRuleExampleKo, getRuleShortTipKo } from './rule-examples.js';

export interface DashboardDeps {
  config?: Config;
  rootOverride?: string;
}

export function buildDashboardServer(deps: DashboardDeps = {}): FastifyInstance {
  const config = deps.config ?? loadConfig(deps.rootOverride);
  const paths = getPaths(deps.rootOverride);
  const logger = createLogger('dashboard', { file: paths.workerLog, stdout: false });
  const fastify = Fastify({ logger: false });
  const db = openDb(deps.rootOverride);

  // Parse application/x-www-form-urlencoded for the feedback form POSTs.
  fastify.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_req, body, done) => {
      try {
        const params = new URLSearchParams(body as string);
        const out: Record<string, string> = {};
        for (const [k, v] of params) out[k] = v;
        done(null, out);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  /**
   * Resolve the locale for a request: ?lang= query → Accept-Language
   * header → saved config.i18n → 'en'. See i18n.ts for details.
   */
  function reqLocale(req: FastifyRequest): Locale {
    const accept = req.headers['accept-language'];
    return resolveLocale(req.query, typeof accept === 'string' ? accept : undefined, config.i18n);
  }

  /** Preserved query string (minus lang) so the language switcher can round-trip. */
  function reqQueryPassthrough(req: FastifyRequest): Record<string, string> {
    const q = (req.query as Record<string, unknown> | null | undefined) ?? {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(q)) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  }

  /** Fresh watermark for the live-refresh poll. */
  function latestPromptId(): string | null {
    const row = db.prepare(`SELECT id FROM prompt_usages ORDER BY created_at DESC LIMIT 1`).get() as
      | { id: string }
      | undefined;
    return row?.id ?? null;
  }

  fastify.get('/health', async () => ({ ok: true }));

  /**
   * Favicon — brand-aligned SVG glyph (accent background + ascending tier
   * bars). Inlined here so the dashboard stays self-contained; no asset
   * pipeline needed (D-012). Served with a one-day cache so browsers
   * don't re-fetch on every navigation.
   */
  const FAVICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
    '<rect width="32" height="32" rx="8" fill="#10b981"/>' +
    '<rect x="7" y="17" width="4" height="8" fill="white"/>' +
    '<rect x="14" y="12" width="4" height="13" fill="white"/>' +
    '<rect x="21" y="8" width="4" height="17" fill="white"/>' +
    '</svg>';
  fastify.get('/favicon.svg', async (_req, reply) => {
    reply
      .type('image/svg+xml')
      .header('Cache-Control', 'public, max-age=86400, immutable')
      .send(FAVICON_SVG);
  });

  /** Live-refresh polling target — cheap, returns JSON, no HTML. */
  fastify.get('/api/overview/latest-id', async () => {
    return { latestId: latestPromptId() };
  });

  fastify.get('/', async (req, reply) => {
    const locale = reqLocale(req);
    const totals = db.prepare(`SELECT COUNT(*) AS c FROM prompt_usages`).get() as { c: number };

    // All-time tier breakdown — force all statuses into the result even when 0.
    const tierRows = db
      .prepare(
        `SELECT COALESCE(qs.tier, 'n/a') AS tier, COUNT(*) AS c
           FROM prompt_usages pu
           LEFT JOIN quality_scores qs ON qs.usage_id = pu.id
          GROUP BY COALESCE(qs.tier, 'n/a')`
      )
      .all() as Array<{ tier: string; c: number }>;
    const tierCountMap: Record<string, number> = Object.fromEntries(
      tierRows.map((r) => [r.tier, r.c])
    );
    const ALL_TIERS = ['good', 'ok', 'weak', 'bad', 'n/a'] as const;
    const tierCounts = ALL_TIERS.map((tierId) => ({
      tier: tierId,
      c: tierCountMap[tierId] ?? 0,
    }));
    const tierTotal = tierCounts.reduce((acc, r) => acc + r.c, 0);

    // Daily tier breakdown — window size driven by ?days=.
    // Accepted: 7, 14, 30, 90, 365, "all". Default 30. Anything else -> 30.
    // "all" walks back to the earliest prompt (capped at 730 days to keep
    // the chart SVG from getting absurdly wide on very old installs).
    const daysParam = (() => {
      const q = (req.query as Record<string, unknown> | null | undefined) ?? {};
      const raw = typeof q.days === 'string' ? q.days.toLowerCase() : undefined;
      if (raw === 'all') return 'all' as const;
      const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
      return [7, 14, 30, 90, 365].includes(n) ? n : 30;
    })();

    // Resolve the actual window length in days.
    let DAYS: number;
    if (daysParam === 'all') {
      const earliest = db.prepare(`SELECT DATE(MIN(created_at)) AS d FROM prompt_usages`).get() as {
        d: string | null;
      };
      if (earliest?.d) {
        const ms = Date.now() - new Date(`${earliest.d}T00:00:00Z`).getTime();
        DAYS = Math.min(730, Math.max(1, Math.ceil(ms / 86400000) + 1));
      } else {
        DAYS = 14; // No data — show an empty 14-day frame.
      }
    } else {
      DAYS = daysParam;
    }

    const dailyRows = db
      .prepare(
        `SELECT DATE(pu.created_at) AS day,
                COALESCE(qs.tier, 'n/a') AS tier,
                COUNT(*) AS c
           FROM prompt_usages pu
           LEFT JOIN quality_scores qs ON qs.usage_id = pu.id
          WHERE pu.created_at >= DATE('now', ?)
          GROUP BY day, tier
          ORDER BY day ASC`
      )
      .all(`-${DAYS - 1} days`) as Array<{ day: string; tier: string; c: number }>;
    const dailyIndex: Record<string, Record<string, number>> = {};
    for (const r of dailyRows) {
      if (!dailyIndex[r.day]) dailyIndex[r.day] = {};
      const bucket = dailyIndex[r.day];
      if (bucket) bucket[r.tier] = r.c;
    }
    const days: Array<{
      day: string;
      good: number;
      ok: number;
      weak: number;
      bad: number;
      na: number;
      total: number;
    }> = [];
    const today = new Date();
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      const b = dailyIndex[key] ?? {};
      const row = {
        day: key,
        good: b.good ?? 0,
        ok: b.ok ?? 0,
        weak: b.weak ?? 0,
        bad: b.bad ?? 0,
        na: b['n/a'] ?? 0,
        total: 0,
      };
      row.total = row.good + row.ok + row.weak + row.bad + row.na;
      days.push(row);
    }
    const windowTotal = days.reduce((a, d) => a + d.total, 0);

    // Period selector options for the header pill bar.
    const PERIOD_OPTIONS: Array<{ value: string; label: string }> = [
      { value: '7', label: '7d' },
      { value: '14', label: '14d' },
      { value: '30', label: '30d' },
      { value: '90', label: '90d' },
      { value: '365', label: '365d' },
      { value: 'all', label: t(locale, 'common.all') },
    ];
    const selectedPeriod = daysParam === 'all' ? 'all' : String(daysParam);
    const periodHtml = PERIOD_OPTIONS.map(({ value, label }) => {
      const href = `/?lang=${locale}&days=${encodeURIComponent(value)}`;
      const active = value === selectedPeriod;
      const base = 'px-2 py-1 text-xs rounded border transition-colors';
      const activeCls = 'bg-accent text-white border-accent';
      const inactiveCls =
        'bg-white dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 border-gray-300 dark:border-zinc-600 hover:bg-gray-100 dark:hover:bg-zinc-700';
      return `<a href="${href}" class="${base} ${active ? activeCls : inactiveCls}">${escapeHtml(label)}</a>`;
    }).join('');

    const recent = db
      .prepare(
        `SELECT pu.id, substr(pu.prompt_text,1,120) AS snippet, pu.created_at,
                COALESCE(qs.final_score, -1) AS score, COALESCE(qs.tier, 'n/a') AS tier
           FROM prompt_usages pu
           LEFT JOIN quality_scores qs ON qs.usage_id = pu.id
          ORDER BY pu.created_at DESC LIMIT 8`
      )
      .all() as Array<{
      id: string;
      snippet: string;
      created_at: string;
      score: number;
      tier: string;
    }>;
    const worst = db
      .prepare(
        `SELECT pu.id, substr(pu.prompt_text,1,120) AS snippet, qs.final_score, qs.tier
           FROM prompt_usages pu JOIN quality_scores qs ON qs.usage_id = pu.id
          ORDER BY qs.final_score ASC LIMIT 5`
      )
      .all() as Array<{ id: string; snippet: string; final_score: number; tier: string }>;

    // Top 5 recurring rule hits over the last 30 days — powers the
    // "Patterns to watch" section (D-044). Pattern = which rule fires
    // repeatedly, not which individual prompt was bad. Intended to make
    // habits visible so users can target *one* fix instead of chasing
    // every flagged prompt.
    const patternRows = db
      .prepare(
        `SELECT rh.rule_id, COUNT(*) AS hits
           FROM rule_hits rh
           JOIN prompt_usages pu ON pu.id = rh.usage_id
          WHERE pu.created_at >= datetime('now', '-30 days')
          GROUP BY rh.rule_id
          ORDER BY hits DESC
          LIMIT 5`
      )
      .all() as Array<{ rule_id: string; hits: number }>;
    // Severity → left bar color (same palette as the detail page lesson
    // cards so the visual language stays consistent).
    const patternSevBar = (ruleId: string): string => {
      const def = getRulesCatalog().find((r) => r.id === ruleId);
      const sev = def?.severity ?? 1;
      if (sev >= 3) return 'bg-red-500';
      if (sev === 2) return 'bg-orange-500';
      return 'bg-yellow-500';
    };

    // Tier tiles — each tier gets its own card with a big mono number, matching
    // the "Total prompts" card's visual weight so all 6 (Total + 5 tiers) scan
    // as a single glanceable KPI row. Left color bar = tier identity; percentage
    // subtitle gives share-of-total context without adding extra labels.
    const TIER_TILE_STYLE: Record<string, { bar: string; num: string; label: string }> = {
      good: {
        bar: 'bg-green-500',
        num: 'text-green-700 dark:text-green-300',
        label: 'GOOD',
      },
      ok: {
        bar: 'bg-yellow-500',
        num: 'text-yellow-700 dark:text-yellow-300',
        label: 'OK',
      },
      weak: {
        bar: 'bg-orange-500',
        num: 'text-orange-700 dark:text-orange-300',
        label: 'WEAK',
      },
      bad: { bar: 'bg-red-500', num: 'text-red-700 dark:text-red-300', label: 'BAD' },
      'n/a': {
        bar: 'bg-gray-400',
        num: 'text-gray-500 dark:text-zinc-400',
        label: 'N/A',
      },
    };
    const tierTilesHtml = tierCounts
      .map((tc) => {
        const pct = tierTotal > 0 ? Math.round((tc.c / tierTotal) * 100) : 0;
        const style = TIER_TILE_STYLE[tc.tier] ?? TIER_TILE_STYLE['n/a'];
        const styleObj = style ?? { bar: 'bg-gray-400', num: 'text-gray-500', label: 'N/A' };
        return `
          <div class="relative bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 shadow-sm p-5 overflow-hidden">
            <div class="absolute left-0 top-0 h-full w-1 ${styleObj.bar}"></div>
            <div class="text-[10px] text-gray-500 dark:text-zinc-400 uppercase tracking-widest font-mono font-semibold">${styleObj.label}</div>
            <div class="text-3xl font-mono mt-2 ${styleObj.num}">${tc.c.toLocaleString()}</div>
            <div class="text-xs text-gray-400 mt-1">${pct}%</div>
          </div>`;
      })
      .join('');

    const chartHtml = renderDailyChart(days);

    const body = `
      <h1 class="text-2xl font-bold mb-6">${escapeHtml(t(locale, 'overview.title'))}</h1>
      <section aria-label="${escapeHtml(t(locale, 'overview.tier_breakdown'))}" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        <div class="bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 shadow-sm p-5">
          <div class="text-[10px] text-gray-500 uppercase tracking-widest font-mono font-semibold">${escapeHtml(t(locale, 'overview.total_prompts'))}</div>
          <div class="text-3xl font-mono mt-2">${totals.c.toLocaleString()}</div>
          <div class="text-xs text-gray-400 mt-1">${escapeHtml(t(locale, 'overview.last_n_days', { n: DAYS }))}: ${windowTotal.toLocaleString()}</div>
        </div>
        ${tierTilesHtml}
      </section>

      <!-- Patterns to watch — top 5 recurring rule hits over last 30 days -->
      <section class="mb-8">
        <h2 class="text-lg font-bold mb-3 flex items-baseline gap-2">
          ${escapeHtml(t(locale, 'overview.patterns_to_watch'))}
          <span class="text-xs font-normal text-gray-500">${escapeHtml(t(locale, 'overview.patterns_window'))}</span>
        </h2>
        ${
          patternRows.length === 0
            ? `<div class="text-gray-400 text-sm">${escapeHtml(t(locale, 'overview.patterns_empty'))}</div>`
            : `<div class="bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 shadow-sm divide-y divide-gray-100 dark:divide-zinc-700 overflow-hidden">${patternRows
                .map((p) => {
                  const shortTip = locale === 'ko' ? getRuleShortTipKo(p.rule_id) : null;
                  const ruleDef = getRulesCatalog().find((r) => r.id === p.rule_id);
                  const fallback = ruleDef?.description ?? p.rule_id;
                  const line = shortTip ?? fallback;
                  return `<div class="relative flex items-center gap-3 p-3 pl-5">
                    <div class="absolute left-0 top-0 h-full w-1 ${patternSevBar(p.rule_id)}"></div>
                    <span class="font-mono text-xs font-semibold w-12 text-gray-700 dark:text-zinc-200">${escapeHtml(p.rule_id)}</span>
                    <span class="text-sm text-gray-700 dark:text-zinc-200 flex-1 truncate">${escapeHtml(line)}</span>
                    <span class="text-xs font-mono text-gray-400 tabular-nums">${p.hits}</span>
                  </div>`;
                })
                .join('')}</div>`
        }
      </section>

      <section class="mb-8">
        <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 class="text-lg font-bold">${escapeHtml(t(locale, 'overview.daily_additions', { n: DAYS }))}</h2>
          <div class="flex items-center gap-3 flex-wrap">
            <div class="flex items-center gap-1">${periodHtml}</div>
            <div class="text-xs text-gray-500">${escapeHtml(t(locale, 'common.total'))} <span class="font-mono">${windowTotal}</span></div>
          </div>
        </div>
        <div class="bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 shadow-sm p-4">
          ${chartHtml}
        </div>
      </section>

      <section class="mb-8">
        <h2 class="text-lg font-bold mb-3">${escapeHtml(t(locale, 'overview.lowest_scoring'))}</h2>
        ${
          worst.length === 0
            ? `<div class="text-gray-400 text-sm">${escapeHtml(t(locale, 'overview.no_scored_yet'))}</div>`
            : `<div class="bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 shadow-sm divide-y divide-gray-100 dark:divide-zinc-700">${worst
                .map(
                  (r) =>
                    `<a href="/prompts/${r.id}?lang=${locale}" class="flex items-center gap-4 p-3 hover:bg-gray-50 dark:hover:bg-zinc-700">
                       <span class="font-mono text-sm w-10 text-right">${r.final_score}</span>
                       ${tierBadge(r.tier, locale)}
                       <span class="text-sm text-gray-700 dark:text-zinc-200 flex-1 truncate">${escapeHtml(r.snippet)}</span>
                     </a>`
                )
                .join('')}</div>`
        }
      </section>

      <section>
        <h2 class="text-lg font-bold mb-3">${escapeHtml(t(locale, 'overview.recent'))}</h2>
        <div class="bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 shadow-sm divide-y divide-gray-100 dark:divide-zinc-700">
          ${recent
            .map(
              (r) =>
                `<a href="/prompts/${r.id}?lang=${locale}" class="flex items-center gap-4 p-3 hover:bg-gray-50 dark:hover:bg-zinc-700">
                   <span class="font-mono text-sm w-10 text-right">${r.score >= 0 ? r.score : '-'}</span>
                   ${tierBadge(r.tier, locale)}
                   <span class="text-xs text-gray-400 w-36">${escapeHtml(r.created_at)}</span>
                   <span class="text-sm text-gray-700 dark:text-zinc-200 flex-1 truncate">${escapeHtml(r.snippet)}</span>
                 </a>`
            )
            .join('')}
        </div>
      </section>`;
    reply.type('text/html; charset=utf-8').send(
      layout(t(locale, 'overview.title'), body, locale, {
        reqPath: '/',
        reqQuery: reqQueryPassthrough(req),
        liveRefresh: { latestId: latestPromptId() },
      })
    );
  });

  fastify.get('/prompts', async (req, reply) => {
    const locale = reqLocale(req);
    const q = (req.query as Record<string, unknown> | null | undefined) ?? {};
    const tierFilter = typeof q.tier === 'string' ? q.tier : undefined;
    const ruleFilter = typeof q.rule === 'string' ? q.rule : undefined;
    const sourceFilter = typeof q.source === 'string' && q.source.length > 0 ? q.source : undefined;
    const wheres: string[] = [];
    const args: unknown[] = [];
    if (tierFilter) {
      wheres.push('qs.tier = ?');
      args.push(tierFilter);
    }
    if (ruleFilter) {
      wheres.push(
        'EXISTS (SELECT 1 FROM rule_hits rh WHERE rh.usage_id = pu.id AND rh.rule_id = ?)'
      );
      args.push(ruleFilter);
    }
    if (sourceFilter) {
      wheres.push('COALESCE(s.source, ?) = ?');
      args.push('claude-code', sourceFilter);
    }
    const where = wheres.length > 0 ? `WHERE ${wheres.join(' AND ')}` : '';
    const rows = db
      .prepare(
        `SELECT pu.id, substr(pu.prompt_text,1,160) AS snippet, pu.created_at, pu.char_len,
                COALESCE(qs.final_score, -1) AS score, COALESCE(qs.tier, 'n/a') AS tier,
                COALESCE(s.source, 'claude-code') AS source,
                (SELECT COUNT(*) FROM rule_hits rh WHERE rh.usage_id=pu.id) AS hits,
                -- Top hit = highest severity, ties broken by rule_id ASC so the
                -- inline hint is stable across re-renders. Used only for
                -- weak/bad tier rows (D-043).
                (SELECT rule_id FROM rule_hits rh
                  WHERE rh.usage_id = pu.id
                  ORDER BY rh.severity DESC, rh.rule_id ASC
                  LIMIT 1) AS top_rule_id
           FROM prompt_usages pu
           LEFT JOIN quality_scores qs ON qs.usage_id = pu.id
           LEFT JOIN sessions s ON s.id = pu.session_id
           ${where}
          ORDER BY pu.created_at DESC LIMIT 100`
      )
      .all(...args) as Array<{
      id: string;
      snippet: string;
      created_at: string;
      char_len: number;
      score: number;
      tier: string;
      source: string;
      hits: number;
      top_rule_id: string | null;
    }>;

    const sourceOptions = [
      'claude-code',
      'chatgpt',
      'claude-ai',
      'gemini',
      'perplexity',
      'genspark',
    ];

    const body = `
      <h1 class="text-2xl font-bold mb-4">${escapeHtml(t(locale, 'prompts.title'))}</h1>
      <form class="mb-4 flex gap-3 text-sm flex-wrap">
        <input type="hidden" name="lang" value="${escapeHtml(locale)}" />
        <select name="tier" class="border rounded px-2 py-1 bg-white dark:bg-zinc-800">
          <option value="">${escapeHtml(t(locale, 'prompts.all_tiers'))}</option>
          ${(['good', 'ok', 'weak', 'bad'] as const)
            .map(
              (tId) =>
                `<option value="${tId}" ${tierFilter === tId ? 'selected' : ''}>${escapeHtml(t(locale, `tier.${tId === 'good' ? 'good' : tId === 'ok' ? 'ok' : tId === 'weak' ? 'weak' : 'bad'}` as 'tier.good' | 'tier.ok' | 'tier.weak' | 'tier.bad'))}</option>`
            )
            .join('')}
        </select>
        <select name="source" class="border rounded px-2 py-1 bg-white dark:bg-zinc-800">
          <option value="">${escapeHtml(t(locale, 'prompts.all_sources'))}</option>
          ${sourceOptions
            .map(
              (s) => `<option value="${s}" ${sourceFilter === s ? 'selected' : ''}>${s}</option>`
            )
            .join('')}
        </select>
        <input name="rule" placeholder="${escapeHtml(t(locale, 'prompts.rule_placeholder'))}" value="${escapeHtml(ruleFilter ?? '')}"
               class="border rounded px-2 py-1 bg-white dark:bg-zinc-800" />
        <button class="px-3 py-1 bg-accent text-white rounded hover:bg-accent/90 transition-colors">${escapeHtml(t(locale, 'prompts.filter'))}</button>
        <a href="/prompts?lang=${locale}" class="px-3 py-1 text-gray-500">${escapeHtml(t(locale, 'prompts.clear'))}</a>
      </form>
      <table class="w-full text-sm bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 shadow-sm overflow-hidden">
        <thead class="bg-gray-100 dark:bg-zinc-700 text-left">
          <tr>
            <th class="p-2 w-40">${escapeHtml(t(locale, 'prompts.col.created'))}</th>
            <th class="p-2 w-16">${escapeHtml(t(locale, 'prompts.col.score'))}</th>
            <th class="p-2 w-24">${escapeHtml(t(locale, 'prompts.col.tier'))}</th>
            <th class="p-2 w-24">${escapeHtml(t(locale, 'prompts.col.source'))}</th>
            <th class="p-2">${escapeHtml(t(locale, 'prompts.col.prompt'))}</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((r) => {
              // Inline improvement hint — only for weak/bad tiers, KO locale.
              // Other tiers stay single-line to keep the table dense.
              const showHint = (r.tier === 'weak' || r.tier === 'bad') && locale === 'ko';
              const shortTip = showHint && r.top_rule_id ? getRuleShortTipKo(r.top_rule_id) : null;
              const hintLine = shortTip
                ? `<div class="text-xs text-gray-500 dark:text-zinc-400 italic mt-0.5 truncate">→ ${escapeHtml(shortTip)}</div>`
                : '';
              return `<tr class="border-t border-gray-100 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-700 cursor-pointer" onclick="location.href='/prompts/${r.id}?lang=${locale}'">
                   <td class="p-2 text-gray-500 text-xs font-mono whitespace-nowrap align-top">${escapeHtml(r.created_at)}</td>
                   <td class="p-2 font-mono align-top">${r.score >= 0 ? r.score : '-'}</td>
                   <td class="p-2 align-top">${tierBadge(r.tier, locale)}</td>
                   <td class="p-2 text-xs text-gray-600 dark:text-zinc-300 align-top">${escapeHtml(r.source)}</td>
                   <td class="p-2 max-w-[32rem] align-top">
                     <div class="truncate">${escapeHtml(r.snippet)}</div>
                     ${hintLine}
                   </td>
                 </tr>`;
            })
            .join('')}
        </tbody>
      </table>`;
    reply.type('text/html; charset=utf-8').send(
      layout(t(locale, 'prompts.title'), body, locale, {
        reqPath: '/prompts',
        reqQuery: reqQueryPassthrough(req),
        liveRefresh: { latestId: latestPromptId() },
      })
    );
  });

  fastify.get('/prompts/:id', async (req, reply) => {
    const locale = reqLocale(req);
    const { id } = req.params as { id: string };
    const u = db.prepare(`SELECT * FROM prompt_usages WHERE id=?`).get(id) as
      | {
          id: string;
          session_id: string;
          prompt_text: string;
          char_len: number;
          word_count: number;
          turn_index: number;
          created_at: string;
          detected_language: string | null;
        }
      | undefined;
    if (!u) {
      reply
        .code(404)
        .type('text/html')
        .send(layout('Not found', '<p>Not found</p>', locale));
      return;
    }
    const score = db.prepare(`SELECT * FROM quality_scores WHERE usage_id=?`).get(id) as
      | {
          rule_score: number;
          usage_score: number | null;
          judge_score: number | null;
          final_score: number;
          tier: string;
        }
      | undefined;
    const hits = db
      .prepare(`SELECT * FROM rule_hits WHERE usage_id=? ORDER BY severity DESC`)
      .all(id) as Array<{ rule_id: string; severity: number; message: string }>;
    const deepAnalyses = getDeepAnalyses(db, id);
    const fb = getOutcomeTotals(db, id);
    const detected = u.detected_language ?? '?';

    // Re-read config each request so consent changes made via the CLI are
    // picked up without a dashboard restart.
    const currentConfig = loadConfig(deps.rootOverride);
    const consentState = currentConfig.analysis.deep_consent;
    const analyzeEnabled = currentConfig.llm.enabled && consentState === 'granted';

    // ----- Build a one-line diagnosis from the top 2 hits (highest severity) -----
    // The rule engine already sorted hits DESC by severity. Take the first
    // two messages and join with " · " — one compact sentence that explains
    // WHY this score, which is what the user most needs above the fold.
    const topHits = hits.slice(0, 2);
    const diagnosisLine =
      topHits.length === 0
        ? t(locale, 'detail.no_issues_found')
        : topHits.map((h) => h.message.trim()).join(' · ');

    // ----- Severity → color class for the left accent bar of lesson cards --
    const sevBar = (sev: number): string => {
      if (sev >= 3) return 'bg-red-500';
      if (sev === 2) return 'bg-orange-500';
      return 'bg-yellow-500';
    };
    const sevTextCls = (sev: number): string => {
      if (sev >= 3) return 'text-red-700 dark:text-red-300';
      if (sev === 2) return 'text-orange-700 dark:text-orange-300';
      return 'text-yellow-700 dark:text-yellow-300';
    };

    // Each rule hit renders as a lesson card: severity bar on the left, rule
    // id + severity + message up top, then the Korean bad→good example
    // inline (KO locale only — other locales get a rule-catalog deep-link).
    const ruleCards =
      hits.length === 0
        ? `<div class="bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 shadow-sm p-4 text-sm text-gray-400">${escapeHtml(t(locale, 'detail.no_hits'))}</div>`
        : hits
            .map((h) => {
              const ex = locale === 'ko' ? getRuleExampleKo(h.rule_id) : null;
              const exampleBlock = ex
                ? `<div class="mt-3 pt-3 border-t border-gray-100 dark:border-zinc-700 space-y-1.5 text-sm">
                     <div><span class="inline-block w-14 text-xs font-mono uppercase tracking-widest text-gray-500">약한 예</span><span class="text-gray-700 dark:text-zinc-200">${escapeHtml(ex.bad)}</span></div>
                     <div><span class="inline-block w-14 text-xs font-mono uppercase tracking-widest text-gray-500">강한 예</span><span class="text-gray-700 dark:text-zinc-200">${escapeHtml(ex.good)}</span></div>
                     ${ex.tip ? `<div class="mt-2 text-xs text-gray-500 italic">💡 ${escapeHtml(ex.tip)}</div>` : ''}
                   </div>`
                : '';
              return `
                <div class="relative bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 shadow-sm overflow-hidden">
                  <div class="absolute left-0 top-0 h-full w-1 ${sevBar(h.severity)}"></div>
                  <div class="p-4 pl-5">
                    <div class="flex items-center gap-3 mb-1.5">
                      <span class="font-mono text-sm font-semibold ${sevTextCls(h.severity)}">${escapeHtml(h.rule_id)}</span>
                      <span class="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300">SEV ${h.severity}</span>
                    </div>
                    <div class="text-sm text-gray-800 dark:text-zinc-100">${escapeHtml(h.message)}</div>
                    ${exampleBlock}
                  </div>
                </div>`;
            })
            .join('');

    const body = `
      <div class="mb-3"><a href="/prompts?lang=${locale}" class="text-accent text-sm hover:underline">${escapeHtml(t(locale, 'common.back'))}</a></div>

      <!-- HERO · Score + one-line diagnosis + sub-scores -->
      <section class="bg-white dark:bg-zinc-800 rounded-2xl border border-gray-200 dark:border-zinc-700 shadow-sm p-6 mb-6">
        <div class="flex items-start gap-5 flex-wrap">
          <div class="flex items-baseline gap-2">
            <div class="text-5xl font-mono font-semibold">${score ? score.final_score : '—'}</div>
            <div class="text-sm text-gray-400 font-mono">/100</div>
          </div>
          <div class="flex-1 min-w-[16rem]">
            <div class="mb-2">${score ? tierBadge(score.tier, locale) : ''}</div>
            <div class="text-sm text-gray-700 dark:text-zinc-200 leading-relaxed">${escapeHtml(diagnosisLine)}</div>
          </div>
        </div>
        ${
          score
            ? `<div class="mt-5 pt-5 border-t border-gray-100 dark:border-zinc-700 text-xs text-gray-400">rule ${score.rule_score} · usage ${score.usage_score ?? '–'} · judge ${score.judge_score ?? '–'}</div>`
            : ''
        }
      </section>

      <!-- ORIGINAL -->
      <section class="mb-6">
        <div class="bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 shadow-sm p-4">
          <div class="text-[10px] text-gray-500 uppercase tracking-widest font-mono font-semibold mb-2">${escapeHtml(t(locale, 'detail.original'))}</div>
          <pre class="text-sm">${escapeHtml(u.prompt_text)}</pre>
        </div>
      </section>

      <!-- WHAT WENT WRONG · rule hits as lesson cards -->
      <section class="mb-6">
        <h2 class="font-bold mb-3 flex items-center gap-2">
          ${escapeHtml(t(locale, 'detail.rule_hits'))}
          <span class="text-xs font-normal text-gray-500 font-mono">${hits.length}</span>
        </h2>
        <div class="space-y-3">
          ${ruleCards}
        </div>
      </section>

      <!-- DEEP ANALYSIS -->
      <section class="mb-6">
        <h2 class="font-bold mb-3">${escapeHtml(t(locale, 'detail.deep_analysis'))}</h2>
        ${renderDeepAnalysisSection(u.id, locale, consentState, currentConfig.llm.enabled, analyzeEnabled, deepAnalyses)}
      </section>

      <!-- FEEDBACK · demoted below main content so users rate AFTER reading -->
      <section class="mb-6 pt-4 border-t border-gray-100 dark:border-zinc-700 flex items-center gap-3 flex-wrap">
        <span class="text-xs text-gray-500">${escapeHtml(t(locale, 'detail.feedback'))}</span>
        <form method="POST" action="/prompts/${escapeHtml(u.id)}/feedback" style="display:inline">
          <input type="hidden" name="rating" value="up" />
          <button class="px-3 py-1 rounded-lg border border-green-300 bg-green-50 dark:bg-green-900/40 hover:bg-green-100 dark:hover:bg-green-900/60 text-sm transition-colors">👍 ${fb.ups}</button>
        </form>
        <form method="POST" action="/prompts/${escapeHtml(u.id)}/feedback" style="display:inline">
          <input type="hidden" name="rating" value="down" />
          <button class="px-3 py-1 rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/40 hover:bg-red-100 dark:hover:bg-red-900/60 text-sm transition-colors">👎 ${fb.downs}</button>
        </form>
        <span class="text-xs text-gray-400">${escapeHtml(t(locale, 'detail.reprocess_hint'))}</span>
      </section>

      <!-- META · debugging info, collapsed by default -->
      <details class="text-xs text-gray-500">
        <summary class="cursor-pointer select-none hover:text-accent">${escapeHtml(t(locale, 'detail.title'))} ${escapeHtml(u.id.slice(-8))}</summary>
        <div class="mt-2 pl-4 space-y-1 font-mono">
          <div>id: ${escapeHtml(u.id)}</div>
          <div>${escapeHtml(t(locale, 'detail.session'))}: <a class="underline hover:text-accent" href="/sessions/${u.session_id}?lang=${locale}">${escapeHtml(u.session_id)}</a></div>
          <div>${u.char_len} ${escapeHtml(t(locale, 'detail.chars'))} · ${u.word_count} ${escapeHtml(t(locale, 'detail.words'))} · ${escapeHtml(t(locale, 'detail.turn'))} ${u.turn_index} · <span class="uppercase">${escapeHtml(detected)}</span></div>
          <div>${escapeHtml(u.created_at)}</div>
        </div>
      </details>`;
    reply.type('text/html; charset=utf-8').send(
      layout(t(locale, 'detail.title'), body, locale, {
        reqPath: `/prompts/${u.id}`,
        reqQuery: reqQueryPassthrough(req),
        liveRefresh: { latestId: latestPromptId() },
      })
    );
  });

  fastify.get('/sessions/:id', async (req, reply) => {
    const locale = reqLocale(req);
    const { id } = req.params as { id: string };
    const session = db.prepare(`SELECT * FROM sessions WHERE id=?`).get(id) as
      | { cwd: string; model: string | null; started_at: string }
      | undefined;
    if (!session) {
      reply
        .code(404)
        .type('text/html')
        .send(layout('Not found', '<p>Not found</p>', locale));
      return;
    }
    const usages = db
      .prepare(
        `SELECT pu.id, substr(pu.prompt_text,1,120) AS snippet, pu.turn_index, pu.created_at,
                COALESCE(qs.final_score, -1) AS score, COALESCE(qs.tier, 'n/a') AS tier
           FROM prompt_usages pu LEFT JOIN quality_scores qs ON qs.usage_id=pu.id
          WHERE pu.session_id=? ORDER BY pu.turn_index ASC`
      )
      .all(id) as Array<{
      id: string;
      snippet: string;
      turn_index: number;
      created_at: string;
      score: number;
      tier: string;
    }>;
    const subs = db
      .prepare(`SELECT * FROM subagent_invocations WHERE session_id=? ORDER BY started_at ASC`)
      .all(id) as Array<{
      agent_type: string;
      agent_id: string;
      status: string;
      prompt_text: string | null;
    }>;
    const tools = db
      .prepare(
        `SELECT tool_name, call_count, fail_count, total_ms FROM tool_use_rollups WHERE session_id=? ORDER BY call_count DESC`
      )
      .all(id) as Array<{
      tool_name: string;
      call_count: number;
      fail_count: number;
      total_ms: number;
    }>;
    const body = `
      <h1 class="text-2xl font-bold mb-2">${escapeHtml(t(locale, 'session.title'))} ${escapeHtml(id.slice(-8))}</h1>
      <div class="text-xs text-gray-500 mb-4">
        cwd: ${escapeHtml(session.cwd)} · model: ${escapeHtml(session.model ?? '-')} · started ${escapeHtml(session.started_at)}
      </div>

      <h2 class="font-bold mb-2">${escapeHtml(t(locale, 'session.turns'))}</h2>
      <div class="bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 shadow-sm divide-y divide-gray-100 dark:divide-zinc-700 mb-6">
        ${usages
          .map(
            (u) =>
              `<a href="/prompts/${u.id}?lang=${locale}" class="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-zinc-700">
                 <span class="text-xs text-gray-400 w-8">#${u.turn_index}</span>
                 <span class="font-mono text-sm w-10 text-right">${u.score >= 0 ? u.score : '-'}</span>
                 ${tierBadge(u.tier, locale)}
                 <span class="flex-1 truncate text-sm">${escapeHtml(u.snippet)}</span>
               </a>`
          )
          .join('')}
      </div>

      <h2 class="font-bold mb-2">${escapeHtml(t(locale, 'session.subagents'))} (${subs.length})</h2>
      <div class="bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 shadow-sm divide-y divide-gray-100 dark:divide-zinc-700 mb-6">
        ${
          subs.length === 0
            ? `<div class="p-3 text-sm text-gray-400">${escapeHtml(t(locale, 'session.none'))}</div>`
            : subs
                .map(
                  (s) =>
                    `<div class="p-3">
                       <div class="text-sm font-semibold">${escapeHtml(s.agent_type)} · <span class="text-gray-400 text-xs">${escapeHtml(s.agent_id)}</span></div>
                       <div class="text-xs text-gray-500 mt-1">${escapeHtml(s.status)}</div>
                       ${s.prompt_text ? `<div class="mt-2 text-xs text-gray-600"><span class="font-semibold">${escapeHtml(t(locale, 'session.prompt'))}</span> ${escapeHtml(s.prompt_text.slice(0, 200))}</div>` : ''}
                     </div>`
                )
                .join('')
        }
      </div>

      <h2 class="font-bold mb-2">${escapeHtml(t(locale, 'session.tool_rollup'))}</h2>
      <table class="w-full text-sm bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 shadow-sm overflow-hidden">
        <thead class="bg-gray-100 dark:bg-zinc-700 text-left">
          <tr>
            <th class="p-2">${escapeHtml(t(locale, 'session.col.tool'))}</th>
            <th class="p-2">${escapeHtml(t(locale, 'session.col.calls'))}</th>
            <th class="p-2">${escapeHtml(t(locale, 'session.col.fails'))}</th>
            <th class="p-2">${escapeHtml(t(locale, 'session.col.ms'))}</th>
          </tr>
        </thead>
        <tbody>
          ${tools
            .map(
              (toolRow) =>
                `<tr class="border-t border-gray-100 dark:border-zinc-700">
                   <td class="p-2 font-mono">${escapeHtml(toolRow.tool_name)}</td>
                   <td class="p-2">${toolRow.call_count}</td>
                   <td class="p-2 ${toolRow.fail_count > 0 ? 'text-red-600' : ''}">${toolRow.fail_count}</td>
                   <td class="p-2 text-gray-500">${toolRow.total_ms}</td>
                 </tr>`
            )
            .join('')}
        </tbody>
      </table>`;
    reply.type('text/html; charset=utf-8').send(
      layout(t(locale, 'session.title'), body, locale, {
        reqPath: `/sessions/${id}`,
        reqQuery: reqQueryPassthrough(req),
      })
    );
  });

  fastify.get('/rules', async (req, reply) => {
    const locale = reqLocale(req);
    const catalog = getRulesCatalog();
    const hitStats = db
      .prepare(`SELECT rule_id, COUNT(*) AS c FROM rule_hits GROUP BY rule_id`)
      .all() as Array<{ rule_id: string; c: number }>;
    const hitMap = Object.fromEntries(hitStats.map((h) => [h.rule_id, h.c]));
    const body = `
      <h1 class="text-2xl font-bold mb-4">${escapeHtml(t(locale, 'rules.title'))}</h1>
      <table class="w-full text-sm bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 shadow-sm overflow-hidden">
        <thead class="bg-gray-100 dark:bg-zinc-700 text-left">
          <tr>
            <th class="p-2 w-16">${escapeHtml(t(locale, 'rules.col.id'))}</th>
            <th class="p-2">${escapeHtml(t(locale, 'rules.col.name'))}</th>
            <th class="p-2 w-24">${escapeHtml(t(locale, 'rules.col.category'))}</th>
            <th class="p-2 w-16">${escapeHtml(t(locale, 'rules.col.sev'))}</th>
            <th class="p-2 w-16">${escapeHtml(t(locale, 'rules.col.hits'))}</th>
            <th class="p-2">${escapeHtml(t(locale, 'rules.col.description'))}</th>
          </tr>
        </thead>
        <tbody>
        ${catalog
          .map(
            (r) =>
              `<tr class="border-t border-gray-100 dark:border-zinc-700">
                 <td class="p-2 font-mono">${escapeHtml(r.id)}</td>
                 <td class="p-2">${escapeHtml(r.name)}</td>
                 <td class="p-2 text-gray-600">${escapeHtml(r.category)}</td>
                 <td class="p-2">${r.severity}</td>
                 <td class="p-2 text-gray-500">${hitMap[r.id] ?? 0}</td>
                 <td class="p-2 text-gray-700 dark:text-zinc-300">${escapeHtml(r.description)}</td>
               </tr>`
          )
          .join('')}
        </tbody>
      </table>`;
    reply.type('text/html; charset=utf-8').send(
      layout(t(locale, 'rules.title'), body, locale, {
        reqPath: '/rules',
        reqQuery: reqQueryPassthrough(req),
        liveRefresh: { latestId: latestPromptId() },
      })
    );
  });

  fastify.get('/settings', async (req, reply) => {
    const locale = reqLocale(req);
    const body = `
      <h1 class="text-2xl font-bold mb-4">${escapeHtml(t(locale, 'settings.title'))}</h1>
      <p class="text-sm text-gray-600 dark:text-zinc-300 mb-4">${escapeHtml(t(locale, 'settings.edit_hint'))}</p>
      <pre class="bg-gray-100 dark:bg-zinc-800 rounded p-4 text-sm">think-prompt config list
think-prompt config set agent.coach_mode true
think-prompt config set llm.enabled true
think-prompt coach on</pre>
      <h2 class="font-bold mt-6 mb-2">${escapeHtml(t(locale, 'settings.config_readonly'))}</h2>
      <pre class="bg-gray-100 dark:bg-zinc-800 rounded p-4 text-xs overflow-auto">${escapeHtml(JSON.stringify(config, null, 2))}</pre>`;
    reply.type('text/html; charset=utf-8').send(
      layout(t(locale, 'settings.title'), body, locale, {
        reqPath: '/settings',
        reqQuery: reqQueryPassthrough(req),
      })
    );
  });

  fastify.get('/doctor', async (req, reply) => {
    const locale = reqLocale(req);
    const agentPid = db.prepare(`SELECT value FROM _meta WHERE key='installed_at'`).get() as
      | { value: string }
      | undefined;
    const counts = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM prompt_usages) AS usages,
           (SELECT COUNT(*) FROM sessions) AS sessions,
           (SELECT COUNT(*) FROM quality_scores) AS scores,
           (SELECT COUNT(*) FROM rule_hits) AS hits`
      )
      .get() as {
      usages: number;
      sessions: number;
      scores: number;
      hits: number;
    };
    const body = `
      <h1 class="text-2xl font-bold mb-4">${escapeHtml(t(locale, 'doctor.title'))}</h1>
      <div class="bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 shadow-sm p-4 mb-4">
        <h2 class="font-bold mb-2">${escapeHtml(t(locale, 'doctor.counts'))}</h2>
        <ul class="text-sm space-y-1">
          <li>prompt_usages: ${counts.usages}</li>
          <li>sessions: ${counts.sessions}</li>
          <li>quality_scores: ${counts.scores}</li>
          <li>rule_hits: ${counts.hits}</li>
        </ul>
      </div>
      <div class="bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 shadow-sm p-4">
        <h2 class="font-bold mb-2">${escapeHtml(t(locale, 'doctor.installed'))}</h2>
        <p class="text-sm text-gray-500">${escapeHtml(agentPid?.value ?? 'unknown')}</p>
      </div>`;
    reply.type('text/html; charset=utf-8').send(
      layout(t(locale, 'doctor.title'), body, locale, {
        reqPath: '/doctor',
        reqQuery: reqQueryPassthrough(req),
        liveRefresh: { latestId: latestPromptId() },
      })
    );
  });

  // POST /prompts/:id/feedback — form-encoded {rating: up|down, note?}
  fastify.post<{
    Params: { id: string };
    Body: { rating?: string; note?: string };
  }>('/prompts/:id/feedback', async (req, reply) => {
    const { id } = req.params;
    const body = (req.body ?? {}) as { rating?: string; note?: string };
    const rating = body.rating;
    if (rating !== 'up' && rating !== 'down') {
      reply.code(400).type('text/plain').send('rating must be up or down');
      return;
    }
    const row = db.prepare(`SELECT id FROM prompt_usages WHERE id=?`).get(id) as
      | { id: string }
      | undefined;
    if (!row) {
      reply.code(404).type('text/plain').send('prompt not found');
      return;
    }
    recordOutcome(db, id, rating, body.note ?? null);
    reply.redirect(`/prompts/${id}`);
  });

  // POST /settings/consent — form-encoded {decision: grant|revoke}. Persists
  // the user's deep-analysis consent choice to config.json (D-033).
  fastify.post<{ Body: { decision?: string; return_to?: string } }>(
    '/settings/consent',
    async (req, reply) => {
      const body = (req.body ?? {}) as { decision?: string; return_to?: string };
      if (body.decision !== 'grant' && body.decision !== 'revoke') {
        reply.code(400).type('text/plain').send('decision must be grant or revoke');
        return;
      }
      const cfg = loadConfig(deps.rootOverride);
      const next = body.decision === 'grant' ? 'granted' : 'denied';
      let updated = setConfigValue(cfg, 'analysis.deep_consent', next);
      updated = setConfigValue(updated, 'analysis.deep_consent_at', new Date().toISOString());
      saveConfig(updated, deps.rootOverride);
      reply.redirect(body.return_to || '/');
    }
  );

  // POST /prompts/:id/analyze — run a deep analysis on demand. Gates:
  // llm.enabled, API key, consent === granted. Any gate failure returns 400.
  fastify.post<{ Params: { id: string } }>('/prompts/:id/analyze', async (req, reply) => {
    const { id } = req.params;
    const cfg = loadConfig(deps.rootOverride);
    if (!cfg.llm.enabled) {
      reply
        .code(400)
        .type('text/plain')
        .send('llm is disabled — think-prompt config set llm.enabled true');
      return;
    }
    if (cfg.analysis.deep_consent !== 'granted') {
      reply.code(400).type('text/plain').send('deep-analysis consent not granted');
      return;
    }
    const apiKey = process.env[cfg.llm.api_key_env];
    if (!apiKey) {
      reply
        .code(400)
        .type('text/plain')
        .send(`${cfg.llm.api_key_env} is not set in the environment`);
      return;
    }
    const row = db.prepare(`SELECT id FROM prompt_usages WHERE id=?`).get(id) as
      | { id: string }
      | undefined;
    if (!row) {
      reply.code(404).type('text/plain').send('prompt not found');
      return;
    }
    try {
      await runDeepAnalysis(db, { usage_id: id, apiKey, model: cfg.llm.model });
    } catch (err) {
      logger.error({ err }, 'deep analysis threw');
    }
    reply.redirect(`/prompts/${id}`);
  });

  fastify.addHook('onClose', async () => {
    try {
      db.close();
    } catch {
      // ignore
    }
  });

  logger.info({ port: config.dashboard.port }, 'dashboard initialized');
  return fastify;
}
