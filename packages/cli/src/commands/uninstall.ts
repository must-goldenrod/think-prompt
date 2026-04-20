import { rmSync } from 'node:fs';
import { getPaths } from '@pro-prompt/core';
import pc from 'picocolors';
import { stop } from '../daemon.js';
import { removeHooksFromSettings } from '../settings-merge.js';

export async function uninstallCmd(opts: { purge?: boolean }): Promise<void> {
  const paths = getPaths();
  const result = removeHooksFromSettings(paths.claudeSettings);
  if (result.changed) {
    console.log(pc.green('✓') + ` removed hooks from ${paths.claudeSettings}`);
    if (result.backupPath) console.log(`  (backup: ${result.backupPath})`);
  } else {
    console.log(pc.dim('• no hooks to remove'));
  }
  stop('agent');
  stop('worker');
  stop('dashboard');
  console.log(pc.green('✓') + ' daemons stopped');
  if (opts.purge) {
    rmSync(paths.root, { recursive: true, force: true });
    console.log(pc.red('✓') + ` purged ${paths.root}`);
  } else {
    console.log(pc.dim(`• data kept at ${paths.root} (use --purge to remove)`));
  }
}
