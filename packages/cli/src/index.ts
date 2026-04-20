import { Command } from 'commander';
import {
  autostartDisableCmd,
  autostartEnableCmd,
  autostartStatusCmd,
} from './commands/autostart.js';
import { coachCmd, configGetCmd, configListCmd, configSetCmd } from './commands/config-cmd.js';
import { restartCmd, startCmd, statusCmd, stopCmd } from './commands/daemon-cmds.js';
import { doctorCmd } from './commands/doctor.js';
import { exportCmd, reprocessCmd } from './commands/export-reprocess.js';
import { feedbackCmd } from './commands/feedback.js';
import { installCmd } from './commands/install.js';
import { listCmd } from './commands/list.js';
import { openCmd } from './commands/open.js';
import { rewriteCmd } from './commands/rewrite.js';
import { showCmd } from './commands/show.js';
import { uninstallCmd } from './commands/uninstall.js';
import { wipeCmd } from './commands/wipe.js';

const program = new Command();

program
  .name('think-prompt')
  .description('Claude Code prompt collector + quality coach (local-first)')
  .version('0.1.0');

program.command('install').description('install hooks + start daemons').action(installCmd);

program
  .command('uninstall')
  .description('remove hooks + stop daemons (data preserved unless --purge)')
  .option('--purge', 'also delete ~/.think-prompt/')
  .action(uninstallCmd);

program.command('start').description('start agent + worker daemons').action(startCmd);
program.command('stop').description('stop agent + worker daemons').action(stopCmd);
program.command('restart').description('restart daemons').action(restartCmd);
program.command('status').description('show daemon status').action(statusCmd);
program.command('doctor').description('run health checks').action(doctorCmd);

program
  .command('list')
  .description('list recent prompts')
  .option('--limit <n>', 'max rows', '20')
  .option('--tier <tier>', 'filter by tier (good/ok/weak/bad)')
  .option('--rule <id>', 'filter by rule id (e.g., R003)')
  .action(listCmd);

program.command('show <id>').description('show prompt details by id or suffix').action(showCmd);

program
  .command('rewrite <id>')
  .description('generate LLM rewrite suggestion (requires llm.enabled)')
  .option('--copy', 'copy the rewrite to clipboard')
  .action(rewriteCmd);

program.command('coach <state>').description('toggle inline coach mode (on/off)').action(coachCmd);

program
  .command('feedback <id> <rating>')
  .description('record 👍/👎 feedback for a prompt (rating = up | down)')
  .option('--note <text>', 'optional free-form note')
  .action(feedbackCmd);

const config = program.command('config').description('get/set/list config');
config
  .command('get [key]')
  .description('get config value (whole config if no key)')
  .action(configGetCmd);
config.command('set <key> <value>').description('set config value').action(configSetCmd);
config.command('list').description('print full config').action(configListCmd);

program
  .command('reprocess')
  .description('re-run rules + rescore')
  .option('--all', 'all prompts')
  .option('--session <id>', 'only one session')
  .action(reprocessCmd);

program
  .command('export')
  .description('export data as JSON')
  .option('--since <age>', 'e.g. 30d, 7d, 24h')
  .requiredOption('--out <file>', 'output path')
  .action(exportCmd);

program.command('open').description('open local dashboard in browser').action(openCmd);

const autostart = program
  .command('autostart')
  .description('manage OS-level auto-start (launchd on macOS, systemd --user on Linux)');
autostart
  .command('enable')
  .description('register & load auto-start units (opt-in, sudo not needed)')
  .action(autostartEnableCmd);
autostart
  .command('disable')
  .description('unload & remove auto-start units (data preserved)')
  .action(autostartDisableCmd);
autostart.command('status').description('show auto-start unit status').action(autostartStatusCmd);

program
  .command('wipe')
  .description('delete all data + hooks')
  .option('--yes', 'confirm destructive action')
  .action(wipeCmd);

program.parseAsync(process.argv).catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
