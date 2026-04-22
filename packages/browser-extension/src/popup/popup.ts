async function checkAgent(): Promise<boolean> {
  try {
    const res = await fetch('http://127.0.0.1:47823/health', {
      headers: { 'x-think-prompt-ext': '1' },
    });
    return res.ok;
  } catch {
    return false;
  }
}

function renderAgentStatus(reachable: boolean): void {
  const el = document.getElementById('agent-status');
  if (!el) return;
  el.replaceChildren();
  const dot = document.createElement('span');
  dot.className = `dot ${reachable ? 'on' : 'off'}`;
  const text = document.createTextNode(reachable ? 'running' : 'not reachable');
  el.append(dot, text);
}

async function refreshStats(): Promise<void> {
  renderAgentStatus(await checkAgent());
  chrome.runtime.sendMessage(
    { kind: 'stats' },
    (res: { total: number; synced: number; pending: number; poisoned?: number } | undefined) => {
      if (!res) return;
      const p = document.getElementById('pending');
      const s = document.getElementById('synced');
      const x = document.getElementById('poisoned');
      const retryBtn = document.getElementById('retry-btn') as HTMLButtonElement | null;
      if (p) p.textContent = String(res.pending);
      if (s) s.textContent = String(res.synced);
      if (x) x.textContent = String(res.poisoned ?? 0);
      if (retryBtn) retryBtn.style.display = (res.poisoned ?? 0) > 0 ? 'block' : 'none';
    }
  );
}

document.getElementById('sync-btn')?.addEventListener('click', () => {
  chrome.runtime.sendMessage({ kind: 'sync-now' }, () => refreshStats());
});

document.getElementById('retry-btn')?.addEventListener('click', () => {
  chrome.runtime.sendMessage({ kind: 'retry-poisoned' }, () => refreshStats());
});

document.getElementById('options-btn')?.addEventListener('click', () => {
  chrome.runtime.openOptionsPage?.();
});

refreshStats();
setInterval(refreshStats, 5000);
