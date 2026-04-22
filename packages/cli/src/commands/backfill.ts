/**
 * `think-prompt backfill` — scan `~/.claude/projects/**\/*.jsonl` and report
 * how many historical user prompts could be imported.
 *
 * This first shipment is DRY-RUN ONLY. `--execute` is deliberately refused
 * with a clear message so the user sees numbers before committing to a
 * potentially tens-of-thousands-of-rows import. A follow-up PR will wire
 * the scanner output into insertPromptUsage + the rules engine.
 */
import { openDb, scanClaudeHistory } from '@think-prompt/core';
import pc from 'picocolors';

export interface BackfillCmdOptions {
  dryRun?: boolean;
  execute?: boolean;
  limit?: string;
  since?: string;
  project?: string;
  root?: string;
}

export async function backfillCmd(opts: BackfillCmdOptions): Promise<void> {
  if (opts.execute && !opts.dryRun) {
    console.log(
      pc.yellow('⚠') + ' --execute is not wired up yet — this release ships scan-only so you can'
    );
    console.log('  preview the counts before a mass import. Run without --execute (or with');
    console.log('  --dry-run) to see what would be imported; real import lands in a follow-up.');
    return;
  }

  const limit = opts.limit ? Number.parseInt(opts.limit, 10) : 0;
  if (opts.limit && (Number.isNaN(limit) || limit < 0)) {
    console.log(pc.red('✗') + ` invalid --limit value: ${opts.limit}`);
    process.exit(2);
  }

  let db: ReturnType<typeof openDb> | null = null;
  try {
    db = openDb();
  } catch (err) {
    console.log(
      pc.yellow('⚠') +
        ` could not open local DB (${(err as Error).message}); treating everything as new`
    );
  }

  const t0 = Date.now();
  console.log(pc.dim(`scanning ${opts.root ?? '~/.claude/projects'} ...`));
  const stats = scanClaudeHistory(db, {
    ...(opts.root ? { root: opts.root } : {}),
    ...(limit > 0 ? { limit } : {}),
    ...(opts.since ? { since: opts.since } : {}),
    ...(opts.project ? { projectFilter: opts.project } : {}),
  });
  const ms = Date.now() - t0;
  if (db) db.close();

  if (!stats.rootExists) {
    console.log(pc.red('✗') + ` directory not found: ${stats.root}`);
    console.log('  Claude Code stores session transcripts under ~/.claude/projects/.');
    console.log(
      '  If you have never run Claude Code on this machine, there is nothing to backfill.'
    );
    process.exit(1);
    return;
  }

  console.log('');
  console.log(pc.bold(`Claude Code history scan  ${pc.dim(`(${ms} ms)`)}`));
  console.log('');
  printRow('root', stats.root);
  printRow('files scanned', stats.filesScanned.toLocaleString());
  printRow('files with user prompts', stats.filesWithPrompts.toLocaleString());
  if (stats.filesFailed > 0) {
    printRow('files failed to parse', pc.yellow(stats.filesFailed.toLocaleString()));
  }
  printRow('distinct sessions', stats.distinctSessions.toLocaleString());
  console.log('');
  printRow('total user entries', stats.totalUserEntries.toLocaleString());
  printRow('extractable prompts', stats.extractablePrompts.toLocaleString());
  if (stats.skippedBySince > 0) {
    printRow(`skipped by --since ${opts.since}`, stats.skippedBySince.toLocaleString());
  }
  console.log('');
  printRow('already in DB (dedup)', pc.dim(stats.alreadyInDb.toLocaleString()));
  printRow(
    'would be imported',
    stats.newPrompts > 0 ? pc.green(stats.newPrompts.toLocaleString()) : '0'
  );
  console.log('');
  if (stats.earliestTimestamp) {
    printRow('earliest timestamp', stats.earliestTimestamp);
    printRow('latest timestamp', stats.latestTimestamp ?? '');
  }
  console.log('');
  console.log(pc.dim('dry-run only — nothing was written.'));
  if (stats.newPrompts > 0) {
    console.log(
      pc.dim(
        `next step: a future release will add --execute to import these ${stats.newPrompts.toLocaleString()} prompts.`
      )
    );
  }
}

function printRow(label: string, value: string): void {
  const pad = 28;
  const key = label.padEnd(pad);
  console.log(`  ${pc.dim(key)}${value}`);
}
