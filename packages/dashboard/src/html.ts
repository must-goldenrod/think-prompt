export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} · Think-Prompt</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = { theme: { extend: { colors: {
      good: '#22c55e', ok: '#eab308', weak: '#f97316', bad: '#ef4444'
    }}}};
  </script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    pre { white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body class="bg-gray-50 dark:bg-zinc-900 dark:text-zinc-100 min-h-screen">
  <header class="bg-white dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-700">
    <div class="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
      <div class="flex items-center gap-6">
        <a href="/" class="text-xl font-bold">Think-Prompt</a>
        <nav class="text-sm flex gap-4 text-gray-600 dark:text-zinc-300">
          <a href="/" class="hover:text-blue-600">Overview</a>
          <a href="/prompts" class="hover:text-blue-600">Prompts</a>
          <a href="/rules" class="hover:text-blue-600">Rules</a>
          <a href="/settings" class="hover:text-blue-600">Settings</a>
          <a href="/doctor" class="hover:text-blue-600">Doctor</a>
        </nav>
      </div>
      <div class="text-xs text-gray-400">local-only · ${new Date().toISOString().slice(0, 10)}</div>
    </div>
  </header>
  <main class="max-w-6xl mx-auto px-6 py-6">
${body}
  </main>
</body>
</html>`;
}

export function tierBadge(tier: string): string {
  const map: Record<string, string> = {
    good: 'bg-green-100 text-green-800',
    ok: 'bg-yellow-100 text-yellow-800',
    weak: 'bg-orange-100 text-orange-800',
    bad: 'bg-red-100 text-red-800',
  };
  const cls = map[tier] ?? 'bg-gray-100 text-gray-800';
  return `<span class="inline-block px-2 py-0.5 text-xs rounded ${cls}">${escapeHtml(tier)}</span>`;
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
 * Inline SVG stacked bar chart — no JS, no external lib. Each bar is one day
 * and the segments (bottom-up: good → ok → weak → bad → n/a) match tierBadge
 * colors so the chart and the breakdown card read consistently.
 *
 * Design: the chart is layout-responsive (width 100%), uses viewBox so it
 * scales cleanly on dark/light, and labels the daily total above each bar
 * so the user never has to eyeball the segment heights.
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
  // Round up to a "nice" axis max so y-gridlines land on integers.
  const niceMax = niceCeil(maxRaw);
  const yOf = (v: number): number => padT + innerH - (v / niceMax) * innerH;
  const xOf = (i: number): number => padL + slot * i + (slot - barW) / 2;

  const COLORS = {
    good: '#22c55e',
    ok: '#eab308',
    weak: '#f97316',
    bad: '#ef4444',
    na: '#9ca3af',
  } as const;

  // 4 gridlines + axis
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(niceMax * t));
  const gridLines = ticks
    .map(
      (t) =>
        `<line x1="${padL}" y1="${yOf(t)}" x2="${W - padR}" y2="${yOf(t)}" stroke="currentColor" stroke-opacity="0.08" />
         <text x="${padL - 6}" y="${yOf(t) + 3}" text-anchor="end" font-size="10" fill="currentColor" fill-opacity="0.5">${t}</text>`
    )
    .join('');

  const bars = data
    .map((d, i) => {
      const x = xOf(i);
      // Stack bottom-up
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
        d.total > 0
          ? `<text x="${x + barW / 2}" y="${runY - 4}" text-anchor="middle" font-size="10" font-family="ui-monospace, Menlo, monospace" fill="currentColor" fill-opacity="0.7">${d.total}</text>`
          : '';
      // Show MM/DD every other day when >10 bars to avoid label crowding
      const showLabel = n <= 10 || i % 2 === 0 || i === n - 1;
      const [, mm, dd] = d.day.split('-');
      const dayLabel = showLabel
        ? `<text x="${x + barW / 2}" y="${H - padB + 14}" text-anchor="middle" font-size="10" fill="currentColor" fill-opacity="0.55">${mm}/${dd}</text>`
        : '';
      return stack + totalLabel + dayLabel;
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
