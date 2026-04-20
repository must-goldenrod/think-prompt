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
  <title>${escapeHtml(title)} · Pro-Prompt</title>
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
        <a href="/" class="text-xl font-bold">Pro-Prompt</a>
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
