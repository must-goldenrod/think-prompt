import { loadConfig } from '@think-prompt/core';
import pc from 'picocolors';
import { restart, start, status, stop } from '../daemon.js';

export async function startCmd(): Promise<void> {
  const a = start('agent');
  const w = start('worker');
  const d = start('dashboard');
  const cfg = loadConfig();
  console.log(
    (a.running ? pc.green('✓') : pc.red('✗')) + ` agent (pid ${a.pid ?? '-'}, :${cfg.agent.port})`
  );
  console.log((w.running ? pc.green('✓') : pc.red('✗')) + ` worker (pid ${w.pid ?? '-'})`);
  console.log(
    (d.running ? pc.green('✓') : pc.red('✗')) +
      ` dashboard (pid ${d.pid ?? '-'}, :${cfg.dashboard.port})`
  );
}

export async function stopCmd(): Promise<void> {
  stop('agent');
  stop('worker');
  stop('dashboard');
  console.log(pc.green('✓') + ' stopped');
}

export async function restartCmd(): Promise<void> {
  restart('agent');
  restart('worker');
  restart('dashboard');
  console.log(pc.green('✓') + ' restarted');
}

export async function statusCmd(): Promise<void> {
  const a = status('agent');
  const w = status('worker');
  const d = status('dashboard');
  const cfg = loadConfig();
  console.log(
    `agent:     ${a.running ? pc.green('running') : pc.red('stopped')}  pid=${a.pid ?? '-'}  :${cfg.agent.port}`
  );
  console.log(
    `worker:    ${w.running ? pc.green('running') : pc.red('stopped')}  pid=${w.pid ?? '-'}`
  );
  console.log(
    `dashboard: ${d.running ? pc.green('running') : pc.red('stopped')}  pid=${d.pid ?? '-'}  :${cfg.dashboard.port}`
  );
}
