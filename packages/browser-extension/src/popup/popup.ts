async function checkAgent(): Promise<boolean> {
  try {
    const res = await fetch('http://127.0.0.1:47823/health');
    return res.ok;
  } catch {
    return false;
  }
}

async function refreshStats(): Promise<void> {
  const reachable = await checkAgent();
  const el = document.getElementById('agent-status');
  if (el) {
    el.innerHTML = `<span class="dot ${reachable ? 'on' : 'off'}"></span>${reachable ? 'running' : 'not reachable'}`;
  }
  chrome.runtime.sendMessage(
    { kind: 'stats' },
    (res: { total: number; synced: number; pending: number } | undefined) => {
      if (!res) return;
      const p = document.getElementById('pending');
      const s = document.getElementById('synced');
      if (p) p.textContent = String(res.pending);
      if (s) s.textContent = String(res.synced);
    }
  );
}

document.getElementById('sync-btn')?.addEventListener('click', () => {
  chrome.runtime.sendMessage({ kind: 'sync-now' }, () => refreshStats());
});

document.getElementById('options-btn')?.addEventListener('click', () => {
  chrome.runtime.openOptionsPage?.();
});

refreshStats();
setInterval(refreshStats, 5000);
