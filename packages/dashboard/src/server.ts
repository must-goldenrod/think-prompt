import {
  type Config,
  createLogger,
  getOutcomeTotals,
  getPaths,
  loadConfig,
  openDb,
  recordOutcome,
} from '@think-prompt/core';
import { getRulesCatalog } from '@think-prompt/rules';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { escapeHtml, layout, renderDailyChart, tierBadge } from './html.js';
import { type Locale, resolveLocale, t } from './i18n.js';

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

  /** Inject the current latestId so the polling script can diff it. */
  function latestIdBootScript(id: string | null): string {
    return `<script>document.documentElement.setAttribute('data-latest-id', ${JSON.stringify(id ?? '')});</script>`;
  }

  fastify.get('/health', async () => ({ ok: true }));

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
      const activeCls = 'bg-blue-600 text-white border-blue-600';
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

    const tierHtml = tierCounts
      .map(
        (tc) =>
          `<div class="flex items-center gap-2"><span class="font-mono text-sm">${tc.c}</span>${tierBadge(tc.tier, locale)}</div>`
      )
      .join('');

    const chartHtml = renderDailyChart(days);

    const body = `
      ${latestIdBootScript(latestPromptId())}
      <h1 class="text-2xl font-bold mb-6">${escapeHtml(t(locale, 'overview.title'))}</h1>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div class="bg-white dark:bg-zinc-800 rounded-lg shadow p-5">
          <div class="text-xs text-gray-500">${escapeHtml(t(locale, 'overview.total_prompts'))}</div>
          <div class="text-3xl font-mono mt-2">${totals.c}</div>
          <div class="text-xs text-gray-400 mt-1">${escapeHtml(t(locale, 'overview.last_n_days', { n: DAYS }))}: ${windowTotal}</div>
        </div>
        <div class="bg-white dark:bg-zinc-800 rounded-lg shadow p-5">
          <div class="flex items-center justify-between mb-3">
            <div class="text-xs text-gray-500">${escapeHtml(t(locale, 'overview.tier_breakdown'))}</div>
            <div class="text-xs text-gray-400">${escapeHtml(t(locale, 'common.total'))} <span class="font-mono">${tierTotal}</span></div>
          </div>
          <div class="flex gap-3 flex-wrap">${tierHtml}</div>
        </div>
      </div>

      <section class="mb-8">
        <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 class="text-lg font-bold">${escapeHtml(t(locale, 'overview.daily_additions', { n: DAYS }))}</h2>
          <div class="flex items-center gap-3 flex-wrap">
            <div class="flex items-center gap-1">${periodHtml}</div>
            <div class="text-xs text-gray-500">${escapeHtml(t(locale, 'common.total'))} <span class="font-mono">${windowTotal}</span></div>
          </div>
        </div>
        <div class="bg-white dark:bg-zinc-800 rounded-lg shadow p-4">
          ${chartHtml}
        </div>
      </section>

      <section class="mb-8">
        <h2 class="text-lg font-bold mb-3">${escapeHtml(t(locale, 'overview.lowest_scoring'))}</h2>
        ${
          worst.length === 0
            ? `<div class="text-gray-400 text-sm">${escapeHtml(t(locale, 'overview.no_scored_yet'))}</div>`
            : `<div class="bg-white dark:bg-zinc-800 rounded-lg shadow divide-y divide-gray-100 dark:divide-zinc-700">${worst
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
        <div class="bg-white dark:bg-zinc-800 rounded-lg shadow divide-y divide-gray-100 dark:divide-zinc-700">
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
        liveRefresh: true,
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
                (SELECT COUNT(*) FROM rule_hits rh WHERE rh.usage_id=pu.id) AS hits
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
      ${latestIdBootScript(latestPromptId())}
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
        <button class="px-3 py-1 bg-blue-600 text-white rounded">${escapeHtml(t(locale, 'prompts.filter'))}</button>
        <a href="/prompts?lang=${locale}" class="px-3 py-1 text-gray-500">${escapeHtml(t(locale, 'prompts.clear'))}</a>
      </form>
      <table class="w-full text-sm bg-white dark:bg-zinc-800 rounded-lg shadow overflow-hidden">
        <thead class="bg-gray-100 dark:bg-zinc-700 text-left">
          <tr>
            <th class="p-2 w-16">${escapeHtml(t(locale, 'prompts.col.score'))}</th>
            <th class="p-2 w-20">${escapeHtml(t(locale, 'prompts.col.tier'))}</th>
            <th class="p-2 w-24">${escapeHtml(t(locale, 'prompts.col.source'))}</th>
            <th class="p-2 w-10">${escapeHtml(t(locale, 'prompts.col.hits'))}</th>
            <th class="p-2">${escapeHtml(t(locale, 'prompts.col.prompt'))}</th>
            <th class="p-2 w-40">${escapeHtml(t(locale, 'prompts.col.created'))}</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) =>
                `<tr class="border-t border-gray-100 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-700 cursor-pointer" onclick="location.href='/prompts/${r.id}?lang=${locale}'">
                   <td class="p-2 font-mono">${r.score >= 0 ? r.score : '-'}</td>
                   <td class="p-2">${tierBadge(r.tier, locale)}</td>
                   <td class="p-2 text-xs text-gray-600 dark:text-zinc-300">${escapeHtml(r.source)}</td>
                   <td class="p-2 text-gray-500">${r.hits}</td>
                   <td class="p-2 truncate max-w-[32rem]">${escapeHtml(r.snippet)}</td>
                   <td class="p-2 text-gray-400 text-xs">${escapeHtml(r.created_at)}</td>
                 </tr>`
            )
            .join('')}
        </tbody>
      </table>`;
    reply.type('text/html; charset=utf-8').send(
      layout(t(locale, 'prompts.title'), body, locale, {
        reqPath: '/prompts',
        reqQuery: reqQueryPassthrough(req),
        liveRefresh: true,
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
    const rewrites = db
      .prepare(`SELECT * FROM rewrites WHERE usage_id=? ORDER BY created_at DESC`)
      .all(id) as Array<{
      status: string;
      created_at: string;
      after_text: string;
      reason: string | null;
    }>;
    const fb = getOutcomeTotals(db, id);
    const detected = u.detected_language ?? '?';

    const body = `
      <div class="mb-3"><a href="/prompts?lang=${locale}" class="text-blue-600 text-sm">${escapeHtml(t(locale, 'common.back'))}</a></div>
      <h1 class="text-2xl font-bold mb-2">${escapeHtml(t(locale, 'detail.title'))} ${escapeHtml(u.id.slice(-8))}</h1>
      <div class="text-xs text-gray-500 mb-4">
        ${escapeHtml(t(locale, 'detail.session'))} <a class="underline" href="/sessions/${u.session_id}?lang=${locale}">${escapeHtml(u.session_id)}</a>
        · ${u.char_len} ${escapeHtml(t(locale, 'detail.chars'))} · ${u.word_count} ${escapeHtml(t(locale, 'detail.words'))} · ${escapeHtml(t(locale, 'detail.turn'))} ${u.turn_index}
        · <span class="uppercase">${escapeHtml(detected)}</span>
        · ${escapeHtml(u.created_at)}
      </div>

      <div class="mb-4 flex items-center gap-3">
        <span class="text-xs text-gray-500">${escapeHtml(t(locale, 'detail.feedback'))}</span>
        <form method="POST" action="/prompts/${escapeHtml(u.id)}/feedback" style="display:inline">
          <input type="hidden" name="rating" value="up" />
          <button class="px-3 py-1 rounded border border-green-300 bg-green-50 dark:bg-green-900 hover:bg-green-100 text-sm">👍 ${fb.ups}</button>
        </form>
        <form method="POST" action="/prompts/${escapeHtml(u.id)}/feedback" style="display:inline">
          <input type="hidden" name="rating" value="down" />
          <button class="px-3 py-1 rounded border border-red-300 bg-red-50 dark:bg-red-900 hover:bg-red-100 text-sm">👎 ${fb.downs}</button>
        </form>
        <span class="text-xs text-gray-400">${escapeHtml(t(locale, 'detail.reprocess_hint'))}</span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div class="md:col-span-2 bg-white dark:bg-zinc-800 rounded-lg shadow p-4">
          <div class="text-xs text-gray-500 mb-2">${escapeHtml(t(locale, 'detail.original'))}</div>
          <pre class="text-sm">${escapeHtml(u.prompt_text)}</pre>
        </div>
        <div class="bg-white dark:bg-zinc-800 rounded-lg shadow p-4">
          <div class="text-xs text-gray-500 mb-3">${escapeHtml(t(locale, 'detail.score'))}</div>
          ${
            score
              ? `<div class="text-4xl font-mono mb-3">${score.final_score}</div>
                 <div class="mb-3">${tierBadge(score.tier, locale)}</div>
                 <div class="text-xs space-y-1 text-gray-600 dark:text-zinc-300">
                   <div>rule: ${score.rule_score}</div>
                   <div>usage: ${score.usage_score ?? '-'}</div>
                   <div>judge: ${score.judge_score ?? '-'}</div>
                 </div>`
              : `<div class="text-sm text-gray-400">${escapeHtml(t(locale, 'common.no_data'))}</div>`
          }
        </div>
      </div>

      <h2 class="font-bold mb-2">${escapeHtml(t(locale, 'detail.rule_hits'))}</h2>
      <div class="bg-white dark:bg-zinc-800 rounded-lg shadow divide-y divide-gray-100 dark:divide-zinc-700 mb-6">
        ${
          hits.length === 0
            ? `<div class="p-3 text-sm text-gray-400">${escapeHtml(t(locale, 'detail.no_hits'))}</div>`
            : hits
                .map(
                  (h) =>
                    `<div class="p-3 flex items-start gap-3">
                       <span class="font-mono text-sm text-yellow-700">${escapeHtml(h.rule_id)}</span>
                       <span class="text-xs text-gray-500">sev ${h.severity}</span>
                       <span class="text-sm flex-1">${escapeHtml(h.message)}</span>
                     </div>`
                )
                .join('')
        }
      </div>

      <h2 class="font-bold mb-2">${escapeHtml(t(locale, 'detail.suggested_rewrites'))}</h2>
      <div class="space-y-3">
        ${
          rewrites.length === 0
            ? `<div class="text-sm text-gray-400">${escapeHtml(t(locale, 'detail.rewrite_none'))}<code>think-prompt rewrite ${escapeHtml(u.id)}</code></div>`
            : rewrites
                .map(
                  (r) =>
                    `<div class="bg-white dark:bg-zinc-800 rounded-lg shadow p-4">
                       <div class="text-xs text-gray-500 mb-2">${escapeHtml(r.status)} · ${escapeHtml(r.created_at)}</div>
                       <pre class="text-sm">${escapeHtml(r.after_text)}</pre>
                       ${r.reason ? `<div class="mt-2 text-xs text-gray-500 italic">${escapeHtml(r.reason)}</div>` : ''}
                     </div>`
                )
                .join('')
        }
      </div>`;
    reply.type('text/html; charset=utf-8').send(
      layout(t(locale, 'detail.title'), body, locale, {
        reqPath: `/prompts/${u.id}`,
        reqQuery: reqQueryPassthrough(req),
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
      <div class="bg-white dark:bg-zinc-800 rounded-lg shadow divide-y divide-gray-100 dark:divide-zinc-700 mb-6">
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
      <div class="bg-white dark:bg-zinc-800 rounded-lg shadow divide-y divide-gray-100 dark:divide-zinc-700 mb-6">
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
      <table class="w-full text-sm bg-white dark:bg-zinc-800 rounded-lg shadow overflow-hidden">
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
      <table class="w-full text-sm bg-white dark:bg-zinc-800 rounded-lg shadow overflow-hidden">
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
           (SELECT COUNT(*) FROM rule_hits) AS hits,
           (SELECT COUNT(*) FROM rewrites) AS rewrites`
      )
      .get() as {
      usages: number;
      sessions: number;
      scores: number;
      hits: number;
      rewrites: number;
    };
    const body = `
      <h1 class="text-2xl font-bold mb-4">${escapeHtml(t(locale, 'doctor.title'))}</h1>
      <div class="bg-white dark:bg-zinc-800 rounded-lg shadow p-4 mb-4">
        <h2 class="font-bold mb-2">${escapeHtml(t(locale, 'doctor.counts'))}</h2>
        <ul class="text-sm space-y-1">
          <li>prompt_usages: ${counts.usages}</li>
          <li>sessions: ${counts.sessions}</li>
          <li>quality_scores: ${counts.scores}</li>
          <li>rule_hits: ${counts.hits}</li>
          <li>rewrites: ${counts.rewrites}</li>
        </ul>
      </div>
      <div class="bg-white dark:bg-zinc-800 rounded-lg shadow p-4">
        <h2 class="font-bold mb-2">${escapeHtml(t(locale, 'doctor.installed'))}</h2>
        <p class="text-sm text-gray-500">${escapeHtml(agentPid?.value ?? 'unknown')}</p>
      </div>`;
    reply.type('text/html; charset=utf-8').send(
      layout(t(locale, 'doctor.title'), body, locale, {
        reqPath: '/doctor',
        reqQuery: reqQueryPassthrough(req),
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
