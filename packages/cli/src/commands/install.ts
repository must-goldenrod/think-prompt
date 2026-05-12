import { getPaths, loadConfig, openDb } from '@think-prompt/core';
import pc from 'picocolors';
import { type Role, start } from '../daemon.js';
import { mergeHooksIntoSettings } from '../settings-merge.js';

export interface InstallOptions {
  /** When false, skip the dashboard daemon — caller embeds the dashboard elsewhere (e.g. claude-alive React UI). */
  dashboard?: boolean;
}

/**
 * Programmatic + CLI install entry. Initializes the DB, merges hooks into Claude
 * settings.json, and starts the requested daemons.
 *
 * `--no-dashboard` (CLI) → `{ dashboard: false }` (programmatic). When set, only
 * agent + worker spawn — the dashboard package isn't installed. Used when an
 * external UI (claude-alive) renders the dashboard surface from the same data.
 */
export async function installCmd(opts: InstallOptions = {}): Promise<void> {
  const withDashboard = opts.dashboard !== false;
  const paths = getPaths();
  const config = loadConfig();
  // Initialize DB & config
  const db = openDb();
  db.close();
  const result = mergeHooksIntoSettings(paths.claudeSettings, config.agent.port);
  if (result.changed) {
    console.log(pc.green('✓') + ` Claude settings updated: ${paths.claudeSettings}`);
    if (result.backupPath) console.log(`  (backup: ${result.backupPath})`);
  } else {
    console.log(pc.dim('• Claude settings already up to date'));
  }
  const rolesToStart: Role[] = withDashboard
    ? ['agent', 'worker', 'dashboard']
    : ['agent', 'worker'];
  for (const role of rolesToStart) {
    const s = start(role);
    const port =
      role === 'agent'
        ? `, :${config.agent.port}`
        : role === 'dashboard'
          ? `, :${config.dashboard.port}`
          : '';
    console.log(
      (s.running ? pc.green('✓') : pc.red('✗')) +
        ` ${role} ${s.running ? 'running' : 'failed'} (pid ${s.pid ?? '-'}${port})`
    );
  }
  if (!withDashboard) {
    console.log(pc.dim('• dashboard daemon skipped (--no-dashboard) — external UI expected'));
  }
  console.log(
    '\n' +
      pc.bold('Next:') +
      ` open Claude Code, type anything, then run ${pc.cyan('think-prompt list')}`
  );
}
