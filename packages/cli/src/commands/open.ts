import { spawn } from 'node:child_process';
import { loadConfig } from '@think-prompt/core';
import pc from 'picocolors';

export async function openCmd(): Promise<void> {
  const cfg = loadConfig();
  const url = `http://127.0.0.1:${cfg.dashboard.port}`;
  console.log(pc.dim(`opening ${url} ...`));
  const opener =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  const child = spawn(opener, [url], { detached: true, stdio: 'ignore' });
  child.unref();
}
