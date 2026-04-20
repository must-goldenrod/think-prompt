import { getPaths, loadConfig, openDb } from '@pro-prompt/core';
import pc from 'picocolors';
import { start } from '../daemon.js';
import { mergeHooksIntoSettings } from '../settings-merge.js';

export async function installCmd(): Promise<void> {
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
  const agent = start('agent');
  const worker = start('worker');
  const dashboard = start('dashboard');
  console.log(
    (agent.running ? pc.green('✓') : pc.red('✗')) +
      ` agent ${agent.running ? 'running' : 'failed'} (pid ${agent.pid ?? '-'}, :${config.agent.port})`
  );
  console.log(
    (worker.running ? pc.green('✓') : pc.red('✗')) +
      ` worker ${worker.running ? 'running' : 'failed'} (pid ${worker.pid ?? '-'})`
  );
  console.log(
    (dashboard.running ? pc.green('✓') : pc.red('✗')) +
      ` dashboard ${dashboard.running ? 'running' : 'failed'} (pid ${dashboard.pid ?? '-'}, :${config.dashboard.port})`
  );
  console.log(
    '\n' +
      pc.bold('Next:') +
      ` open Claude Code, type anything, then run ${pc.cyan('pro-prompt list')}`
  );
}
