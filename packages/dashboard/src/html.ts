import { LOCALE_LABELS, type Locale, t } from './i18n.js';

export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface LayoutOptions {
  /** `reqPath` + `reqQuery` preserve current URL when switching language. */
  reqPath?: string;
  reqQuery?: Record<string, string>;
  /**
   * Opt-in live refresh. When true, the page polls the agent's latest
   * prompt-usage id every N seconds and reloads on change. Only enabled
   * on views whose data changes on new-prompt arrival (Overview, Prompts
   * list) — leave off on detail pages to preserve scroll/inputs.
   */
  liveRefresh?: { latestId: string | null };
}

export function layout(
  title: string,
  body: string,
  locale: Locale = 'en',
  opts: LayoutOptions = {}
): string {
  const navItems: Array<[string, keyof typeof LABEL_KEYS]> = [
    ['/', 'nav.overview'],
    ['/prompts', 'nav.prompts'],
    ['/settings', 'nav.settings'],
    ['/doctor', 'nav.doctor'],
  ];
  const navHtml = navItems
    .map(([href, key]) => {
      const url = appendLangParam(href, locale);
      return `<a href="${url}" class="hover:text-accent transition-colors">${escapeHtml(t(locale, key))}</a>`;
    })
    .join('');
  const langSwitcher = renderLanguageSwitcher(locale, opts);
  const liveScript = opts.liveRefresh
    ? `<script>document.documentElement.setAttribute('data-latest-id', ${JSON.stringify(opts.liveRefresh.latestId ?? '')});</script>${LIVE_REFRESH_SCRIPT}`
    : '';

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} · Think-Prompt</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    // Shared brand tokens — mirrors site/index.html so the marketing page and
    // the local dashboard read as the same product. See D-037.
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            ink: '#0b0d12',
            accent: '#6366f1',
            good: '#22c55e', ok: '#eab308', weak: '#f97316', bad: '#ef4444'
          },
          fontFamily: {
            sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Inter', 'sans-serif'],
            mono: ['ui-monospace', 'SF Mono', 'Menlo', 'Monaco', 'monospace']
          }
        }
      }
    };
  </script>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
      font-feature-settings: "ss01", "cv11";
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }
    pre { white-space: pre-wrap; word-break: break-word; }
    :focus-visible {
      outline: 2px solid #6366f1;
      outline-offset: 3px;
      border-radius: 4px;
    }
  </style>
</head>
<body class="bg-gray-50 dark:bg-zinc-900 dark:text-zinc-100 min-h-screen">
  <header class="bg-white dark:bg-zinc-800 border-b border-gray-100 dark:border-zinc-700">
    <div class="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
      <div class="flex items-center gap-6">
        <a href="${appendLangParam('/', locale)}" class="flex items-center gap-2 text-xl font-bold">
          <span class="inline-block w-2 h-2 rounded-full bg-accent"></span>Think-Prompt
        </a>
        <nav class="text-sm flex gap-4 text-gray-600 dark:text-zinc-300">
          ${navHtml}
        </nav>
      </div>
      <div class="flex items-center gap-4">
        ${langSwitcher}
        <div class="text-xs text-gray-400">${escapeHtml(t(locale, 'footer.local_only'))} · ${new Date().toISOString().slice(0, 10)}</div>
      </div>
    </div>
  </header>
  <main class="max-w-6xl mx-auto px-6 py-6">
${body}
  </main>
  ${liveScript}
</body>
</html>`;
}

/**
 * Append ?lang=<locale> to a path, preserving any existing query string.
 * Used so the locale the user chose survives navigation.
 */
function appendLangParam(href: string, locale: Locale): string {
  const [path, existingQuery = ''] = href.split('?');
  const params = new URLSearchParams(existingQuery);
  params.set('lang', locale);
  return `${path}?${params.toString()}`;
}

function renderLanguageSwitcher(locale: Locale, opts: LayoutOptions): string {
  const basePath = opts.reqPath ?? '/';
  const passthrough = { ...(opts.reqQuery ?? {}) };
  // Remove lang so each option can inject its own.
  delete passthrough.lang;
  const queryPrefix = new URLSearchParams(passthrough).toString();
  const sep = queryPrefix ? '&' : '';

  const options = (['en', 'ko', 'zh', 'es', 'ja'] as Locale[])
    .map((code) => {
      const url = `${basePath}?${queryPrefix}${sep}lang=${code}`;
      const selected = code === locale ? ' selected' : '';
      return `<option value="${escapeHtml(url)}"${selected}>${escapeHtml(LOCALE_LABELS[code])}</option>`;
    })
    .join('');

  return `<label class="text-xs text-gray-500 flex items-center gap-2">
    <span class="sr-only">${escapeHtml(t(locale, 'common.language'))}</span>
    <select
      class="text-xs border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 rounded px-2 py-1"
      onchange="window.location=this.value"
      aria-label="${escapeHtml(t(locale, 'common.language'))}">
      ${options}
    </select>
  </label>`;
}

/**
 * Polls /api/overview/latest-id every 6 seconds. When the watermark changes
 * compared to the value captured at page render, the tab reloads.
 *
 * The polling script is injected only when layout() is called with
 * liveRefresh:true — typically Overview and Prompts list.
 *
 * Kept inline (no external JS file) to stay consistent with the "no bundler"
 * decision (D-012). ~30 lines is acceptable.
 */
const LIVE_REFRESH_SCRIPT = `<script>
(function () {
  const INITIAL = document.documentElement.getAttribute('data-latest-id') || '';
  const INTERVAL_MS = 3000;
  let stopped = false;
  let inflight = false;
  async function tick() {
    if (stopped || inflight || document.hidden) return;
    inflight = true;
    try {
      const r = await fetch('/api/overview/latest-id', { cache: 'no-store' });
      if (!r.ok) return;
      const { latestId } = await r.json();
      if (latestId && latestId !== INITIAL) {
        stopped = true;
        location.reload();
      }
    } catch (_) {
      // Network blip — try again next tick.
    } finally {
      inflight = false;
    }
  }
  const wake = () => { if (!document.hidden && !stopped) tick(); };
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('focus', wake);
  window.addEventListener('pageshow', wake);
  setInterval(tick, INTERVAL_MS);
})();
</script>`;

// Used only for the typing of navItems key-list; kept here to avoid pulling
// the whole Dictionary interface just for the nav labels.
const LABEL_KEYS = {
  'nav.overview': true,
  'nav.prompts': true,
  'nav.rules': true,
  'nav.settings': true,
  'nav.doctor': true,
} as const;

export function tierBadge(tier: string, locale: Locale = 'en'): string {
  const classMap: Record<string, string> = {
    good: 'bg-green-100 text-green-800',
    ok: 'bg-yellow-100 text-yellow-800',
    weak: 'bg-orange-100 text-orange-800',
    bad: 'bg-red-100 text-red-800',
  };
  const cls = classMap[tier] ?? 'bg-gray-100 text-gray-800';
  const labelKey =
    tier === 'good'
      ? 'tier.good'
      : tier === 'ok'
        ? 'tier.ok'
        : tier === 'weak'
          ? 'tier.weak'
          : tier === 'bad'
            ? 'tier.bad'
            : 'tier.na';
  const label = t(locale, labelKey);
  return `<span class="inline-block px-2 py-0.5 text-xs rounded ${cls}">${escapeHtml(label)}</span>`;
}

export interface DailyBucket {
  day: string;
  good: number;
  ok: number;
  weak: number;
  bad: number;
  na: number;
  total: number;
}

/**
 * Inline SVG stacked bar chart. Each bar is one day, segments are tiers
 * (bottom-up: good → ok → weak → bad → n/a). Daily totals sit above the bar.
 *
 * Axis-label strategy switches by window size so 90/365/all views stay
 * readable instead of collapsing into an unreadable MM/DD smudge:
 *   n ≤ 10   — every day labelled
 *   n ≤ 45   — every other day labelled + per-bar totals
 *   n > 45   — dense mode: one YY-MM label per month boundary, no totals
 */
export function renderDailyChart(data: DailyBucket[]): string {
  const W = 640;
  const H = 220;
  const padL = 36;
  const padR = 12;
  const padT = 18;
  const padB = 38;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = Math.max(1, data.length);
  const slot = innerW / n;
  const barW = Math.max(6, Math.floor(slot * 0.7));
  const maxRaw = Math.max(1, ...data.map((d) => d.total));
  const niceMax = niceCeil(maxRaw);
  const yOf = (v: number): number => padT + innerH - (v / niceMax) * innerH;
  const xOf = (i: number): number => padL + slot * i + (slot - barW) / 2;
  const denseMode = n > 45;

  const COLORS = {
    good: '#22c55e',
    ok: '#eab308',
    weak: '#f97316',
    bad: '#ef4444',
    na: '#9ca3af',
  } as const;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t0) => Math.round(niceMax * t0));
  const gridLines = ticks
    .map(
      (tv) =>
        `<line x1="${padL}" y1="${yOf(tv)}" x2="${W - padR}" y2="${yOf(tv)}" stroke="currentColor" stroke-opacity="0.08" />
         <text x="${padL - 6}" y="${yOf(tv) + 3}" text-anchor="end" font-size="10" fill="currentColor" fill-opacity="0.5">${tv}</text>`
    )
    .join('');

  const bars = data
    .map((d, i) => {
      const x = xOf(i);
      let runY = yOf(0);
      const seg = (value: number, color: string): string => {
        if (value <= 0) return '';
        const h = (value / niceMax) * innerH;
        const y = runY - h;
        runY = y;
        return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${color}" />`;
      };
      const stack =
        seg(d.good, COLORS.good) +
        seg(d.ok, COLORS.ok) +
        seg(d.weak, COLORS.weak) +
        seg(d.bad, COLORS.bad) +
        seg(d.na, COLORS.na);
      const totalLabel =
        !denseMode && d.total > 0
          ? `<text x="${x + barW / 2}" y="${runY - 4}" text-anchor="middle" font-size="10" font-family="ui-monospace, Menlo, monospace" fill="currentColor" fill-opacity="0.7">${d.total}</text>`
          : '';
      const [yyyy, mm, dd] = d.day.split('-');
      let axisLabel = '';
      if (denseMode) {
        const prevMonth = i > 0 ? (data[i - 1]?.day.slice(0, 7) ?? '') : '';
        const curMonth = `${yyyy}-${mm}`;
        if (i === 0 || curMonth !== prevMonth) {
          axisLabel = `<text x="${x + barW / 2}" y="${H - padB + 14}" text-anchor="middle" font-size="10" fill="currentColor" fill-opacity="0.55">${(yyyy ?? '').slice(2)}-${mm}</text>`;
        }
      } else {
        const showLabel = n <= 10 || i % 2 === 0 || i === n - 1;
        if (showLabel) {
          axisLabel = `<text x="${x + barW / 2}" y="${H - padB + 14}" text-anchor="middle" font-size="10" fill="currentColor" fill-opacity="0.55">${mm}/${dd}</text>`;
        }
      }
      return stack + totalLabel + axisLabel;
    })
    .join('');

  const legend = [
    { label: 'good', color: COLORS.good },
    { label: 'ok', color: COLORS.ok },
    { label: 'weak', color: COLORS.weak },
    { label: 'bad', color: COLORS.bad },
    { label: 'n/a', color: COLORS.na },
  ]
    .map(
      (l, i) =>
        `<g transform="translate(${padL + i * 72}, ${H - 10})">
           <rect width="10" height="10" y="-8" fill="${l.color}" />
           <text x="14" y="0" font-size="10" fill="currentColor" fill-opacity="0.65">${l.label}</text>
         </g>`
    )
    .join('');

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily prompt additions by tier" class="w-full h-auto text-gray-700 dark:text-zinc-200">
    ${gridLines}
    ${bars}
    ${legend}
  </svg>`;
}

function niceCeil(v: number): number {
  if (v <= 5) return 5;
  if (v <= 10) return 10;
  const pow = 10 ** Math.floor(Math.log10(v));
  const base = v / pow;
  const niceBase = base <= 1 ? 1 : base <= 2 ? 2 : base <= 5 ? 5 : 10;
  return niceBase * pow;
}

/* ----------------------- deep analysis section ------------------------- */

export interface DeepAnalysisViewRow {
  id: string;
  status: string;
  created_at: string;
  model: string;
  after_text: string;
  problems: Array<{ category: string; severity: number; explanation: string }>;
  reasoning: string[];
  applied_fixes: string[];
  input_tokens: number | null;
  output_tokens: number | null;
  error_message: string | null;
}

/**
 * Render the consent banner (if needed) + the "run analysis" button (if
 * granted) + the history of deep analyses for one prompt.
 *
 * Intentionally inline: the block is one UI region on one page, not a
 * reusable component. Keeping it in html.ts avoids pulling React-ish
 * patterns into an otherwise static server-rendered dashboard.
 */
export function renderDeepAnalysisSection(
  usageId: string,
  locale: Locale,
  consent: 'pending' | 'granted' | 'denied',
  llmEnabled: boolean,
  canAnalyze: boolean,
  analyses: DeepAnalysisViewRow[]
): string {
  const safeId = escapeHtml(usageId);
  let banner = '';

  if (consent === 'pending') {
    banner = `
      <div class="bg-amber-50 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-700 rounded-lg p-4 mb-4">
        <div class="text-sm font-semibold mb-2">${escapeHtml(t(locale, 'analysis.consent_title'))}</div>
        <div class="text-xs text-gray-700 dark:text-zinc-200 mb-3 whitespace-pre-line">${escapeHtml(t(locale, 'analysis.consent_body'))}</div>
        <div class="flex gap-2">
          <form method="POST" action="/settings/consent" style="display:inline">
            <input type="hidden" name="decision" value="grant" />
            <input type="hidden" name="return_to" value="/prompts/${safeId}?lang=${locale}" />
            <button class="px-3 py-1 rounded bg-accent text-white text-xs hover:bg-accent/90 transition-colors">${escapeHtml(t(locale, 'analysis.consent_grant'))}</button>
          </form>
          <form method="POST" action="/settings/consent" style="display:inline">
            <input type="hidden" name="decision" value="revoke" />
            <input type="hidden" name="return_to" value="/prompts/${safeId}?lang=${locale}" />
            <button class="px-3 py-1 rounded border border-gray-300 dark:border-zinc-600 text-xs hover:bg-gray-100 dark:hover:bg-zinc-700">${escapeHtml(t(locale, 'analysis.consent_deny'))}</button>
          </form>
        </div>
      </div>`;
  } else if (consent === 'denied') {
    banner = `
      <div class="bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg p-3 mb-4 text-xs text-gray-600 dark:text-zinc-300">
        ${escapeHtml(t(locale, 'analysis.consent_denied_note'))}
        <form method="POST" action="/settings/consent" class="inline ml-2">
          <input type="hidden" name="decision" value="grant" />
          <input type="hidden" name="return_to" value="/prompts/${safeId}?lang=${locale}" />
          <button class="underline hover:text-accent transition-colors">${escapeHtml(t(locale, 'analysis.consent_change'))}</button>
        </form>
      </div>`;
  }

  let runButton = '';
  if (canAnalyze) {
    runButton = `
      <form method="POST" action="/prompts/${safeId}/analyze" class="mb-4">
        <button class="px-4 py-2 rounded bg-purple-600 text-white text-sm hover:bg-purple-700">
          ${escapeHtml(t(locale, 'analysis.run_button'))}
        </button>
        <span class="ml-2 text-xs text-gray-500">${escapeHtml(t(locale, 'analysis.run_hint'))}</span>
      </form>`;
  } else if (consent === 'granted' && !llmEnabled) {
    runButton = `
      <div class="text-xs text-gray-500 mb-4">
        ${escapeHtml(t(locale, 'analysis.llm_disabled_note'))}
        <code class="px-1">think-prompt config set llm.enabled true</code>
      </div>`;
  }

  const history =
    analyses.length === 0
      ? `<div class="text-sm text-gray-400">${escapeHtml(t(locale, 'analysis.no_results_yet'))}</div>`
      : analyses.map((a) => renderDeepAnalysisCard(a, locale)).join('');

  return `${banner}${runButton}<div class="space-y-3">${history}</div>`;
}

function renderDeepAnalysisCard(a: DeepAnalysisViewRow, locale: Locale): string {
  if (a.status !== 'ok') {
    return `
      <div class="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <div class="text-xs text-red-700 dark:text-red-300 mb-2">
          ${escapeHtml(t(locale, 'analysis.failed'))} · ${escapeHtml(a.created_at)}
        </div>
        <div class="text-xs text-gray-700 dark:text-zinc-200">${escapeHtml(a.error_message ?? '')}</div>
      </div>`;
  }

  const problems = a.problems
    .map(
      (p) => `
        <li class="flex items-start gap-2 text-sm">
          <span class="font-mono text-xs text-gray-500">sev ${p.severity}</span>
          <span class="font-semibold text-purple-700 dark:text-purple-300">${escapeHtml(p.category)}</span>
          <span class="flex-1">${escapeHtml(p.explanation)}</span>
        </li>`
    )
    .join('');

  const reasoning = a.reasoning
    .map(
      (r, i) =>
        `<li class="text-sm"><span class="font-mono text-xs text-gray-500 mr-1">${i + 1}.</span>${escapeHtml(r)}</li>`
    )
    .join('');

  const fixes =
    a.applied_fixes.length > 0
      ? `<div class="text-xs text-gray-500 mt-2">${escapeHtml(t(locale, 'analysis.applied_fixes'))}: ${a.applied_fixes
          .map((f) => `<code class="px-1">${escapeHtml(f)}</code>`)
          .join(' ')}</div>`
      : '';

  const tokens =
    a.input_tokens || a.output_tokens
      ? `<div class="text-xs text-gray-400">tokens: in=${a.input_tokens ?? '-'} out=${a.output_tokens ?? '-'}</div>`
      : '';

  return `
    <div class="bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 shadow-sm p-4 border-l-4 border-l-accent">
      <div class="flex items-center justify-between mb-3">
        <div class="text-xs text-gray-500">
          ${escapeHtml(a.model)} · ${escapeHtml(a.created_at)}
        </div>
        ${tokens}
      </div>

      ${
        a.problems.length > 0
          ? `<div class="mb-3">
               <div class="text-xs font-bold text-gray-500 mb-1">${escapeHtml(t(locale, 'analysis.problems'))}</div>
               <ul class="space-y-1">${problems}</ul>
             </div>`
          : ''
      }

      ${
        a.reasoning.length > 0
          ? `<div class="mb-3">
               <div class="text-xs font-bold text-gray-500 mb-1">${escapeHtml(t(locale, 'analysis.reasoning'))}</div>
               <ul class="space-y-1">${reasoning}</ul>
             </div>`
          : ''
      }

      <div>
        <div class="text-xs font-bold text-gray-500 mb-1">${escapeHtml(t(locale, 'analysis.suggested_rewrite'))}</div>
        <pre class="text-sm bg-gray-50 dark:bg-zinc-900 p-3 rounded">${escapeHtml(a.after_text)}</pre>
      </div>
      ${fixes}
    </div>`;
}
