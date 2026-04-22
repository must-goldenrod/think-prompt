interface SiteConfig {
  id: 'chatgpt' | 'claude-ai' | 'gemini' | 'perplexity' | 'genspark';
  name: string;
  description: string;
}

const SITES: SiteConfig[] = [
  { id: 'chatgpt', name: 'ChatGPT', description: 'chat.openai.com / chatgpt.com' },
  { id: 'claude-ai', name: 'Claude.ai', description: 'claude.ai' },
  { id: 'gemini', name: 'Gemini', description: 'gemini.google.com' },
  { id: 'perplexity', name: 'Perplexity', description: 'perplexity.ai' },
  { id: 'genspark', name: 'Genspark', description: 'genspark.ai' },
];

const STORAGE_KEY = 'think-prompt:sites';

async function load(): Promise<Record<string, boolean>> {
  const res = await chrome.storage.local.get(STORAGE_KEY);
  return (res[STORAGE_KEY] as Record<string, boolean>) ?? {};
}
async function save(state: Record<string, boolean>): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

function render(state: Record<string, boolean>): void {
  const root = document.getElementById('site-list');
  if (!root) return;
  root.innerHTML = '';
  for (const s of SITES) {
    const enabled = state[s.id] ?? true;
    const row = document.createElement('div');
    row.className = 'site';
    row.innerHTML = `
      <div>
        <div class="site-name">${s.name}</div>
        <div class="site-desc">${s.description}</div>
      </div>
      <label class="toggle">
        <input type="checkbox" data-site="${s.id}" ${enabled ? 'checked' : ''} />
        <span>${enabled ? 'On' : 'Off'}</span>
      </label>
    `;
    root.appendChild(row);
  }
  root.querySelectorAll('input[type="checkbox"]').forEach((el) => {
    el.addEventListener('change', async (ev) => {
      const input = ev.target as HTMLInputElement;
      const siteId = input.getAttribute('data-site');
      if (!siteId) return;
      const next = await load();
      next[siteId] = input.checked;
      await save(next);
      render(next);
    });
  });
}

load().then(render);

document.getElementById('clear-btn')?.addEventListener('click', () => {
  if (!confirm('Delete every captured prompt from this browser? This cannot be undone.')) return;
  chrome.runtime.sendMessage({ kind: 'clear-all' }, (res: { cleared?: number } | undefined) => {
    const out = document.getElementById('clear-result');
    if (out) out.textContent = `Cleared ${res?.cleared ?? 0} row(s).`;
  });
});
