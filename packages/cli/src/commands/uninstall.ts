import { rmSync } from 'node:fs';
import { getPaths } from '@think-prompt/core';
import pc from 'picocolors';
import { type Role, stop } from '../daemon.js';
import { removeHooksFromSettings } from '../settings-merge.js';

export interface UninstallOptions {
  purge?: boolean;
  /** When false, do not attempt to stop the dashboard daemon (it was never started). */
  dashboard?: boolean;
}

export async function uninstallCmd(opts: UninstallOptions = {}): Promise<void> {
  const withDashboard = opts.dashboard !== false;
  const paths = getPaths();
  const result = removeHooksFromSettings(paths.claudeSettings);
  if (result.changed) {
    console.log(pc.green('✓') + ` removed hooks from ${paths.claudeSettings}`);
    if (result.backupPath) console.log(`  (backup: ${result.backupPath})`);
  } else {
    console.log(pc.dim('• no hooks to remove'));
  }
  const roles: Role[] = withDashboard ? ['agent', 'worker', 'dashboard'] : ['agent', 'worker'];
  for (const role of roles) stop(role);
  console.log(pc.green('✓') + ' daemons stopped');
  if (opts.purge) {
    rmSync(paths.root, { recursive: true, force: true });
    console.log(pc.red('✓') + ` purged ${paths.root}`);
  } else {
    console.log(pc.dim(`• data kept at ${paths.root} (use --purge to remove)`));
  }
}
