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
import Fastify, { type FastifyInstance } from 'fastify';
import { escapeHtml, layout, renderDailyChart, tierBadge } from './html.js';

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

  fastify.get('/health', async () => ({ ok: true }));

  fastify.get('/', async (_req, reply) => {
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
    const tierCounts = ALL_TIERS.map((t) => ({ tier: t, c: tierCountMap[t] ?? 0 }));
    const tierTotal = tierCounts.reduce((acc, r) => acc + r.c, 0);

    // Daily tier breakdown for the last 14 days. We compute the day axis from
    // "today" so empty days still show up as an empty bar (easier to read
    // than a ragged chart that skips silent days).
    const DAYS = 14;
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

    const recent = db
      .prepare(
        `SELECT pu.id, substr(pu.prompt_text,1,120) AS snippet, pu.created_at,
                COALESCE(qs.final_score, -1) AS score, COALESCE(qs.tier, 'n/a') AS tier
           FROM prompt_usages pu
           LEFT JOIN quality_scores qs ON qs.usage_id = pu.id
          ORDER BY pu.created_at DESC LIMIT 8`
      )
      .all() as any[];
    const worst = db
      .prepare(
        `SELECT pu.id, substr(pu.prompt_text,1,120) AS snippet, qs.final_score, qs.tier
           FROM prompt_usages pu JOIN quality_scores qs ON qs.usage_id = pu.id
          ORDER BY qs.final_score ASC LIMIT 5`
      )
      .all() as any[];

    const tierHtml = tierCounts
      .map(
        (t) =>
          `<div class="flex items-center gap-2"><span class="font-mono text-sm">${t.c}</span>${tierBadge(t.tier)}</div>`
      )
      .join('');

    const chartHtml = renderDailyChart(days);
    const dailyListHtml = days
      .map(
        (d) =>
          `<div class="flex items-center justify-between text-xs py-1 border-b border-gray-100 dark:border-zinc-700 last:border-0">
             <span class="text-gray-500 font-mono">${escapeHtml(d.day)}</span>
             <span class="flex items-center gap-2">
               ${d.good ? `<span class="text-xs font-mono" style="color:#16a34a">${d.good}</span>` : ''}
               ${d.ok ? `<span class="text-xs font-mono" style="color:#ca8a04">${d.ok}</span>` : ''}
               ${d.weak ? `<span class="text-xs font-mono" style="color:#ea580c">${d.weak}</span>` : ''}
               ${d.bad ? `<span class="text-xs font-mono" style="color:#dc2626">${d.bad}</span>` : ''}
               ${d.na ? `<span class="text-xs font-mono" style="color:#6b7280">${d.na}</span>` : ''}
               <span class="font-mono w-8 text-right">${d.total}</span>
             </span>
           </div>`
      )
      .join('');

    const body = `
      <h1 class="text-2xl font-bold mb-6">Overview</h1>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div class="bg-white dark:bg-zinc-800 rounded-lg shadow p-5">
          <div class="text-xs text-gray-500">Total prompts</div>
          <div class="text-3xl font-mono mt-2">${totals.c}</div>
          <div class="text-xs text-gray-400 mt-1">last ${DAYS} days: ${windowTotal}</div>
        </div>
        <div class="bg-white dark:bg-zinc-800 rounded-lg shadow p-5">
          <div class="flex items-center justify-between mb-3">
            <div class="text-xs text-gray-500">Tier breakdown</div>
            <div class="text-xs text-gray-400">total <span class="font-mono">${tierTotal}</span></div>
          </div>
          <div class="flex gap-3 flex-wrap">${tierHtml}</div>
        </div>
      </div>

      <section class="mb-8">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-bold">Daily additions (last ${DAYS} days)</h2>
          <div class="text-xs text-gray-500">total <span class="font-mono">${windowTotal}</span></div>
        </div>
        <div class="bg-white dark:bg-zinc-800 rounded-lg shadow p-4">
          ${chartHtml}
          <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-x-8">
            ${dailyListHtml}
          </div>
        </div>
      </section>

      <section class="mb-8">
        <h2 class="text-lg font-bold mb-3">Lowest scoring</h2>
        ${
          worst.length === 0
            ? '<div class="text-gray-400 text-sm">no scored prompts yet</div>'
            : `<div class="bg-white dark:bg-zinc-800 rounded-lg shadow divide-y divide-gray-100 dark:divide-zinc-700">${worst
                .map(
                  (r) =>
                    `<a href="/prompts/${r.id}" class="flex items-center gap-4 p-3 hover:bg-gray-50 dark:hover:bg-zinc-700">
                       <span class="font-mono text-sm w-10 text-right">${r.final_score}</span>
                       ${tierBadge(r.tier)}
                       <span class="text-sm text-gray-700 dark:text-zinc-200 flex-1 truncate">${escapeHtml(r.snippet)}</span>
                     </a>`
                )
                .join('')}</div>`
        }
      </section>

      <section>
        <h2 class="text-lg font-bold mb-3">Recent</h2>
        <div class="bg-white dark:bg-zinc-800 rounded-lg shadow divide-y divide-gray-100 dark:divide-zinc-700">
          ${recent
            .map(
              (r) =>
                `<a href="/prompts/${r.id}" class="flex items-center gap-4 p-3 hover:bg-gray-50 dark:hover:bg-zinc-700">
                   <span class="font-mono text-sm w-10 text-right">${r.score >= 0 ? r.score : '-'}</span>
                   ${tierBadge(r.tier)}
                   <span class="text-xs text-gray-400 w-36">${escapeHtml(r.created_at)}</span>
                   <span class="text-sm text-gray-700 dark:text-zinc-200 flex-1 truncate">${escapeHtml(r.snippet)}</span>
                 </a>`
            )
            .join('')}
        </div>
      </section>`;
    reply.type('text/html; charset=utf-8').send(layout('Overview', body));
  });

  fastify.get('/prompts', async (req, reply) => {
    const q = (req.query as any) ?? {};
    const tierFilter = typeof q.tier === 'string' ? q.tier : undefined;
    const ruleFilter = typeof q.rule === 'string' ? q.rule : undefined;
    const sourceFilter = typeof q.source === 'string' && q.source ? q.source : undefined;
    const wheres: string[] = [];
    const args: any[] = [];
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
      <h1 class="text-2xl font-bold mb-4">Prompts</h1>
      <form class="mb-4 flex gap-3 text-sm flex-wrap">
        <select name="tier" class="border rounded px-2 py-1 bg-white dark:bg-zinc-800">
          <option value="">All tiers</option>
          ${['good', 'ok', 'weak', 'bad']
            .map((t) => `<option value="${t}" ${tierFilter === t ? 'selected' : ''}>${t}</option>`)
            .join('')}
        </select>
        <select name="source" class="border rounded px-2 py-1 bg-white dark:bg-zinc-800">
          <option value="">All sources</option>
          ${sourceOptions
            .map(
              (s) => `<option value="${s}" ${sourceFilter === s ? 'selected' : ''}>${s}</option>`
            )
            .join('')}
        </select>
        <input name="rule" placeholder="rule id e.g. R003" value="${escapeHtml(ruleFilter ?? '')}"
               class="border rounded px-2 py-1 bg-white dark:bg-zinc-800" />
        <button class="px-3 py-1 bg-blue-600 text-white rounded">Filter</button>
        <a href="/prompts" class="px-3 py-1 text-gray-500">Clear</a>
      </form>
      <table class="w-full text-sm bg-white dark:bg-zinc-800 rounded-lg shadow overflow-hidden">
        <thead class="bg-gray-100 dark:bg-zinc-700 text-left">
          <tr>
            <th class="p-2 w-16">Score</th>
            <th class="p-2 w-20">Tier</th>
            <th class="p-2 w-24">Source</th>
            <th class="p-2 w-10">Hits</th>
            <th class="p-2">Prompt</th>
            <th class="p-2 w-40">Created</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) =>
                `<tr class="border-t border-gray-100 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-700 cursor-pointer" onclick="location.href='/prompts/${r.id}'">
                   <td class="p-2 font-mono">${r.score >= 0 ? r.score : '-'}</td>
                   <td class="p-2">${tierBadge(r.tier)}</td>
                   <td class="p-2 text-xs text-gray-600 dark:text-zinc-300">${escapeHtml(r.source)}</td>
                   <td class="p-2 text-gray-500">${r.hits}</td>
                   <td class="p-2 truncate max-w-[32rem]">${escapeHtml(r.snippet)}</td>
                   <td class="p-2 text-gray-400 text-xs">${escapeHtml(r.created_at)}</td>
                 </tr>`
            )
            .join('')}
        </tbody>
      </table>`;
    reply.type('text/html; charset=utf-8').send(layout('Prompts', body));
  });

  fastify.get('/prompts/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = db.prepare(`SELECT * FROM prompt_usages WHERE id=?`).get(id) as any;
    if (!u) {
      reply.code(404).type('text/html').send(layout('Not found', '<p>Not found</p>'));
      return;
    }
    const score = db.prepare(`SELECT * FROM quality_scores WHERE usage_id=?`).get(id) as any;
    const hits = db
      .prepare(`SELECT * FROM rule_hits WHERE usage_id=? ORDER BY severity DESC`)
      .all(id) as any[];
    const rewrites = db
      .prepare(`SELECT * FROM rewrites WHERE usage_id=? ORDER BY created_at DESC`)
      .all(id) as any[];
    const fb = getOutcomeTotals(db, id);
    const lang = u.detected_language ?? '?';

    const body = `
      <div class="mb-3"><a href="/prompts" class="text-blue-600 text-sm">← back</a></div>
      <h1 class="text-2xl font-bold mb-2">Prompt ${escapeHtml(u.id.slice(-8))}</h1>
      <div class="text-xs text-gray-500 mb-4">
        session <a class="underline" href="/sessions/${u.session_id}">${escapeHtml(u.session_id)}</a>
        · ${u.char_len} chars · ${u.word_count} words · turn ${u.turn_index}
        · <span class="uppercase">${escapeHtml(lang)}</span>
        · ${escapeHtml(u.created_at)}
      </div>

      <div class="mb-4 flex items-center gap-3">
        <span class="text-xs text-gray-500">Feedback:</span>
        <form method="POST" action="/prompts/${escapeHtml(u.id)}/feedback" style="display:inline">
          <input type="hidden" name="rating" value="up" />
          <button class="px-3 py-1 rounded border border-green-300 bg-green-50 dark:bg-green-900 hover:bg-green-100 text-sm">👍 ${fb.ups}</button>
        </form>
        <form method="POST" action="/prompts/${escapeHtml(u.id)}/feedback" style="display:inline">
          <input type="hidden" name="rating" value="down" />
          <button class="px-3 py-1 rounded border border-red-300 bg-red-50 dark:bg-red-900 hover:bg-red-100 text-sm">👎 ${fb.downs}</button>
        </form>
        <span class="text-xs text-gray-400">(reprocess after session end to update usage_score)</span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div class="md:col-span-2 bg-white dark:bg-zinc-800 rounded-lg shadow p-4">
          <div class="text-xs text-gray-500 mb-2">Original</div>
          <pre class="text-sm">${escapeHtml(u.prompt_text)}</pre>
        </div>
        <div class="bg-white dark:bg-zinc-800 rounded-lg shadow p-4">
          <div class="text-xs text-gray-500 mb-3">Score</div>
          ${
            score
              ? `<div class="text-4xl font-mono mb-3">${score.final_score}</div>
                 <div class="mb-3">${tierBadge(score.tier)}</div>
                 <div class="text-xs space-y-1 text-gray-600 dark:text-zinc-300">
                   <div>rule: ${score.rule_score}</div>
                   <div>usage: ${score.usage_score ?? '-'}</div>
                   <div>judge: ${score.judge_score ?? '-'}</div>
                 </div>`
              : '<div class="text-sm text-gray-400">no score yet</div>'
          }
        </div>
      </div>

      <h2 class="font-bold mb-2">Rule hits</h2>
      <div class="bg-white dark:bg-zinc-800 rounded-lg shadow divide-y divide-gray-100 dark:divide-zinc-700 mb-6">
        ${
          hits.length === 0
            ? '<div class="p-3 text-sm text-gray-400">(no hits)</div>'
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

      <h2 class="font-bold mb-2">Suggested rewrites</h2>
      <div class="space-y-3">
        ${
          rewrites.length === 0
            ? '<div class="text-sm text-gray-400">(none) — try: <code>think-prompt rewrite ' +
              escapeHtml(u.id) +
              '</code></div>'
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
    reply.type('text/html; charset=utf-8').send(layout('Prompt', body));
  });

  fastify.get('/sessions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = db.prepare(`SELECT * FROM sessions WHERE id=?`).get(id) as any;
    if (!session) {
      reply.code(404).type('text/html').send(layout('Not found', '<p>Not found</p>'));
      return;
    }
    const usages = db
      .prepare(
        `SELECT pu.id, substr(pu.prompt_text,1,120) AS snippet, pu.turn_index, pu.created_at,
                COALESCE(qs.final_score, -1) AS score, COALESCE(qs.tier, 'n/a') AS tier
           FROM prompt_usages pu LEFT JOIN quality_scores qs ON qs.usage_id=pu.id
          WHERE pu.session_id=? ORDER BY pu.turn_index ASC`
      )
      .all(id) as any[];
    const subs = db
      .prepare(`SELECT * FROM subagent_invocations WHERE session_id=? ORDER BY started_at ASC`)
      .all(id) as any[];
    const tools = db
      .prepare(
        `SELECT tool_name, call_count, fail_count, total_ms FROM tool_use_rollups WHERE session_id=? ORDER BY call_count DESC`
      )
      .all(id) as any[];
    const body = `
      <h1 class="text-2xl font-bold mb-2">Session ${escapeHtml(id.slice(-8))}</h1>
      <div class="text-xs text-gray-500 mb-4">
        cwd: ${escapeHtml(session.cwd)} · model: ${escapeHtml(session.model ?? '-')} · started ${escapeHtml(session.started_at)}
      </div>

      <h2 class="font-bold mb-2">Turns</h2>
      <div class="bg-white dark:bg-zinc-800 rounded-lg shadow divide-y divide-gray-100 dark:divide-zinc-700 mb-6">
        ${usages
          .map(
            (u) =>
              `<a href="/prompts/${u.id}" class="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-zinc-700">
                 <span class="text-xs text-gray-400 w-8">#${u.turn_index}</span>
                 <span class="font-mono text-sm w-10 text-right">${u.score >= 0 ? u.score : '-'}</span>
                 ${tierBadge(u.tier)}
                 <span class="flex-1 truncate text-sm">${escapeHtml(u.snippet)}</span>
               </a>`
          )
          .join('')}
      </div>

      <h2 class="font-bold mb-2">Subagents (${subs.length})</h2>
      <div class="bg-white dark:bg-zinc-800 rounded-lg shadow divide-y divide-gray-100 dark:divide-zinc-700 mb-6">
        ${
          subs.length === 0
            ? '<div class="p-3 text-sm text-gray-400">none</div>'
            : subs
                .map(
                  (s) =>
                    `<div class="p-3">
                       <div class="text-sm font-semibold">${escapeHtml(s.agent_type)} · <span class="text-gray-400 text-xs">${escapeHtml(s.agent_id)}</span></div>
                       <div class="text-xs text-gray-500 mt-1">${escapeHtml(s.status)}</div>
                       ${s.prompt_text ? `<div class="mt-2 text-xs text-gray-600"><span class="font-semibold">prompt:</span> ${escapeHtml(s.prompt_text.slice(0, 200))}</div>` : ''}
                     </div>`
                )
                .join('')
        }
      </div>

      <h2 class="font-bold mb-2">Tool use rollup</h2>
      <table class="w-full text-sm bg-white dark:bg-zinc-800 rounded-lg shadow overflow-hidden">
        <thead class="bg-gray-100 dark:bg-zinc-700 text-left">
          <tr><th class="p-2">Tool</th><th class="p-2">Calls</th><th class="p-2">Fails</th><th class="p-2">Total ms</th></tr>
        </thead>
        <tbody>
          ${tools
            .map(
              (t) =>
                `<tr class="border-t border-gray-100 dark:border-zinc-700">
                   <td class="p-2 font-mono">${escapeHtml(t.tool_name)}</td>
                   <td class="p-2">${t.call_count}</td>
                   <td class="p-2 ${t.fail_count > 0 ? 'text-red-600' : ''}">${t.fail_count}</td>
                   <td class="p-2 text-gray-500">${t.total_ms}</td>
                 </tr>`
            )
            .join('')}
        </tbody>
      </table>`;
    reply.type('text/html; charset=utf-8').send(layout('Session', body));
  });

  fastify.get('/rules', async (_req, reply) => {
    const catalog = getRulesCatalog();
    const hitStats = db
      .prepare(`SELECT rule_id, COUNT(*) AS c FROM rule_hits GROUP BY rule_id`)
      .all() as Array<{ rule_id: string; c: number }>;
    const hitMap = Object.fromEntries(hitStats.map((h) => [h.rule_id, h.c]));
    const body = `
      <h1 class="text-2xl font-bold mb-4">Rule catalog</h1>
      <table class="w-full text-sm bg-white dark:bg-zinc-800 rounded-lg shadow overflow-hidden">
        <thead class="bg-gray-100 dark:bg-zinc-700 text-left">
          <tr><th class="p-2 w-16">ID</th><th class="p-2">Name</th><th class="p-2 w-24">Category</th><th class="p-2 w-16">Sev</th><th class="p-2 w-16">Hits</th><th class="p-2">Description</th></tr>
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
    reply.type('text/html; charset=utf-8').send(layout('Rules', body));
  });

  fastify.get('/settings', async (_req, reply) => {
    const body = `
      <h1 class="text-2xl font-bold mb-4">Settings</h1>
      <p class="text-sm text-gray-600 dark:text-zinc-300 mb-4">
        Edit <code>~/.think-prompt/config.json</code> or use the CLI:
      </p>
      <pre class="bg-gray-100 dark:bg-zinc-800 rounded p-4 text-sm">think-prompt config list
think-prompt config set agent.coach_mode true
think-prompt config set llm.enabled true
think-prompt coach on</pre>
      <h2 class="font-bold mt-6 mb-2">Current config (read-only)</h2>
      <pre class="bg-gray-100 dark:bg-zinc-800 rounded p-4 text-xs overflow-auto">${escapeHtml(JSON.stringify(config, null, 2))}</pre>`;
    reply.type('text/html; charset=utf-8').send(layout('Settings', body));
  });

  fastify.get('/doctor', async (_req, reply) => {
    // Simple doctor-like view
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
      .get() as any;
    const body = `
      <h1 class="text-2xl font-bold mb-4">Doctor</h1>
      <div class="bg-white dark:bg-zinc-800 rounded-lg shadow p-4 mb-4">
        <h2 class="font-bold mb-2">Counts</h2>
        <ul class="text-sm space-y-1">
          <li>prompt_usages: ${counts.usages}</li>
          <li>sessions: ${counts.sessions}</li>
          <li>quality_scores: ${counts.scores}</li>
          <li>rule_hits: ${counts.hits}</li>
          <li>rewrites: ${counts.rewrites}</li>
        </ul>
      </div>
      <div class="bg-white dark:bg-zinc-800 rounded-lg shadow p-4">
        <h2 class="font-bold mb-2">Installed</h2>
        <p class="text-sm text-gray-500">${escapeHtml(agentPid?.value ?? 'unknown')}</p>
      </div>`;
    reply.type('text/html; charset=utf-8').send(layout('Doctor', body));
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
    // Redirect back to the detail page
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
