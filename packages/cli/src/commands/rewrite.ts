import { enqueue, getPaths, llm, loadConfig, openDb, ulid } from '@think-prompt/core';
import pc from 'picocolors';

const REWRITE_SYSTEM = `You rewrite developer prompts to maximize clarity and reliability for Claude Code.
Follow this structure in the improved version:
1) Goal — one sentence
2) Context — what project/domain/constraints
3) Task — the single concrete ask
4) Output format — explicit (JSON schema / bullets / length)
5) Success criteria — how to know it worked
6) Optional: 1 short example

Rules:
- Preserve the user's original intent exactly.
- Do NOT add fabricated facts or hidden constraints.
- Keep Korean→Korean, English→English unless user mixed them.

Return STRICT JSON only:
{"after_text": "<improved prompt>", "reason": "<2-3 sentences>", "applied_fixes": ["<rule_id>", ...]}`;

export async function rewriteCmd(id: string, opts: { copy?: boolean }): Promise<void> {
  const db = openDb();
  const config = loadConfig();
  const paths = getPaths();
  interface UsageRow {
    id: string;
    prompt_text: string;
    pii_masked: string;
  }
  const u = db
    .prepare(`SELECT * FROM prompt_usages WHERE id=? OR id LIKE ? ORDER BY created_at DESC LIMIT 1`)
    .get(id, `%${id}`) as UsageRow | undefined;
  if (!u) {
    console.log(pc.red('no matching prompt'));
    db.close();
    return;
  }

  // Try synchronous LLM call if configured; otherwise queue as background job.
  if (!config.llm.enabled) {
    console.log(pc.yellow('⚠') + ' LLM is disabled. Enable first: ');
    console.log('  think-prompt config set llm.enabled true');
    console.log('  export ANTHROPIC_API_KEY=...');
    db.close();
    return;
  }
  const apiKey = process.env[config.llm.api_key_env];
  if (!apiKey) {
    console.log(pc.red('✗') + ` ${config.llm.api_key_env} is not set`);
    db.close();
    return;
  }

  interface RuleHitRow {
    rule_id: string;
    severity: number;
    message: string;
  }
  const hits = db
    .prepare(`SELECT rule_id, severity, message FROM rule_hits WHERE usage_id=?`)
    .all(u.id) as RuleHitRow[];
  const body = [
    '[ORIGINAL PROMPT]',
    u.pii_masked,
    '',
    '[DETECTED ISSUES]',
    hits.length === 0
      ? '(none)'
      : hits.map((h) => `- ${h.rule_id} (sev ${h.severity}): ${h.message}`).join('\n'),
    '[END]',
  ].join('\n');

  try {
    const res = await llm.anthropicMessage({
      apiKey,
      model: config.llm.model,
      system: REWRITE_SYSTEM,
      messages: [{ role: 'user', content: body }],
      maxTokens: 800,
      cacheSystem: true,
    });
    const parsed = llm.parseStrictJson<{ after_text: string; reason?: string }>(res.text);
    if (!parsed?.after_text) {
      console.log(pc.red('✗') + ' LLM returned invalid JSON');
      console.log(pc.dim(res.text.slice(0, 300)));
      db.close();
      return;
    }
    db.prepare(
      `INSERT INTO rewrites(id, usage_id, before_text, after_text, reason, model, status, created_at)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(
      ulid(),
      u.id,
      u.prompt_text,
      parsed.after_text,
      parsed.reason ?? null,
      config.llm.model,
      'proposed',
      new Date().toISOString()
    );
    console.log(pc.bold('─── suggested rewrite ───'));
    console.log(parsed.after_text);
    if (parsed.reason) console.log('\n' + pc.dim('reason: ' + parsed.reason));
    if (opts.copy) {
      // clipboard without extra deps — delegate to pbcopy/xclip if available
      try {
        const { spawn } = await import('node:child_process');
        const cmd = process.platform === 'darwin' ? 'pbcopy' : 'xclip';
        const args = process.platform === 'darwin' ? [] : ['-selection', 'clipboard'];
        const child = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'ignore'] });
        child.stdin.write(parsed.after_text);
        child.stdin.end();
        await new Promise((resolve) => child.on('close', resolve));
        console.log(pc.green('✓') + ' copied to clipboard');
      } catch {
        console.log(pc.yellow('⚠') + ' clipboard copy failed (pbcopy/xclip unavailable)');
      }
    }
  } catch (err) {
    console.log(pc.red('✗') + ' LLM call failed: ' + (err as Error).message);
    // Fallback: enqueue for background retry
    enqueue(paths.queueFile, 'rewrite', { usage_id: u.id });
  }
  db.close();
}
