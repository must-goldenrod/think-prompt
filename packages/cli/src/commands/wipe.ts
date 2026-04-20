import { rmSync } from 'node:fs';
import { getPaths } from '@pro-prompt/core';
import pc from 'picocolors';
import { stop } from '../daemon.js';
import { removeHooksFromSettings } from '../settings-merge.js';

export async function wipeCmd(opts: { yes?: boolean }): Promise<void> {
  if (!opts.yes) {
    console.log(
      pc.red('⚠') + ' This will delete all Pro-Prompt data and remove hooks. Pass --yes to confirm.'
    );
    return;
  }
  stop('agent');
  stop('worker');
  stop('dashboard');
  const paths = getPaths();
  removeHooksFromSettings(paths.claudeSettings);
  rmSync(paths.root, { recursive: true, force: true });
  console.log(pc.green('✓') + ' Pro-Prompt wiped');
}
