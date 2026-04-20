import { openDb } from '@pro-prompt/core';
import pc from 'picocolors';

function matchUsage(db: any, id: string): any | undefined {
  // Allow short suffix matching for convenience.
  if (id.length === 26) return db.prepare(`SELECT * FROM prompt_usages WHERE id=?`).get(id);
  return db
    .prepare(`SELECT * FROM prompt_usages WHERE id LIKE ? ORDER BY created_at DESC LIMIT 1`)
    .get(`%${id}`);
}

export async function showCmd(id: string): Promise<void> {
  const db = openDb();
  const u = matchUsage(db, id);
  if (!u) {
    console.log(pc.red('no matching prompt'));
    return;
  }
  const score = db.prepare(`SELECT * FROM quality_scores WHERE usage_id=?`).get(u.id) as any;
  const hits = db
    .prepare(`SELECT * FROM rule_hits WHERE usage_id=? ORDER BY severity DESC`)
    .all(u.id) as any[];
  const rewrite = db
    .prepare(`SELECT * FROM rewrites WHERE usage_id=? ORDER BY created_at DESC LIMIT 1`)
    .get(u.id) as any;

  console.log(pc.bold(`Prompt ${u.id}`));
  console.log(`  session: ${u.session_id}`);
  console.log(`  created: ${u.created_at}`);
  console.log(`  length:  ${u.char_len} chars, ${u.word_count} words, turn ${u.turn_index}`);
  console.log('');
  console.log(pc.dim('─── original ───'));
  console.log(u.prompt_text);
  console.log('');
  if (score) {
    console.log(
      `${pc.bold('score:')} rule=${score.rule_score} usage=${score.usage_score ?? '-'} judge=${score.judge_score ?? '-'} ` +
        `final=${pc.cyan(score.final_score)} tier=${score.tier}`
    );
  } else {
    console.log(pc.dim('no score yet'));
  }
  if (hits.length > 0) {
    console.log('');
    console.log(pc.bold('rule hits:'));
    for (const h of hits) {
      console.log(`  - ${pc.yellow(h.rule_id)} sev=${h.severity}: ${h.message}`);
    }
  }
  if (rewrite) {
    console.log('');
    console.log(pc.bold(`rewrite (${rewrite.status}):`));
    console.log(pc.dim('─── proposed ───'));
    console.log(rewrite.after_text);
    if (rewrite.reason) console.log(pc.dim(`reason: ${rewrite.reason}`));
  }
  db.close();
}
