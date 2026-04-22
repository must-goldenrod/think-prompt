import { spawn } from 'node:child_process';
import { loadConfig } from '@think-prompt/core';
import pc from 'picocolors';
import { start, status } from '../daemon.js';

/**
 * Opens the local dashboard in a browser tab. If the dashboard daemon is not
 * running, spawn it first and wait for its pidfile before opening the tab —
 * avoiding the "connection refused" experience when the daemon is offline.
 */
export async function openCmd(): Promise<void> {
  const cfg = loadConfig();
  const url = `http://127.0.0.1:${cfg.dashboard.port}`;

  const cur = status('dashboard');
  if (!cur.running) {
    console.log(pc.dim('dashboard daemon not running — starting it ...'));
    const started = start('dashboard');
    if (!started.running) {
      console.log(pc.red('✗') + ' failed to start dashboard daemon');
      console.log(pc.dim('  diagnose with: think-prompt doctor'));
      return;
    }
    console.log(pc.green('✓') + ` dashboard started (pid ${started.pid})`);
  }

  console.log(pc.dim(`opening ${url} ...`));
  const opener =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  const child = spawn(opener, [url], { detached: true, stdio: 'ignore' });
  child.unref();
}
