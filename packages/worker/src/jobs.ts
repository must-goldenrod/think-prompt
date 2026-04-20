import { existsSync, readFileSync, statSync } from 'node:fs';
import {
  composeFinalScore,
  computeUsageScore,
  createLogger,
  finishSubagent,
  llm,
  loadConfig,
  openDb,
  transcript as tp,
  ulid,
  upsertQualityScore,
} from '@think-prompt/core';

const MAX_TRANSCRIPT_BYTES = 10 * 1024 * 1024;

// db returned by openDb; logger returned by createLogger — both typed implicitly.
export interface JobContext {
  db: ReturnType<typeof openDb>;
  logger: ReturnType<typeof createLogger>;
  config: ReturnType<typeof loadConfig>;
  rootOverride?: string | undefined;
}

function safeReadFile(path: string, maxBytes: number): string | null {
  if (!existsSync(path)) return null;
  const size = statSync(path).size;
  if (size <= maxBytes) return readFileSync(path, 'utf8');
  // tail
  const { openSync, readSync, closeSync } = require('node:fs') as typeof import('node:fs');
  const fd = openSync(path, 'r');
  try {
    const start = size - maxBytes;
    const buf = Buffer.alloc(maxBytes);
    readSync(fd, buf, 0, maxBytes, start);
    return buf.toString('utf8');
  } finally {
    closeSync(fd);
  }
}

export async function handleParseSubagentTranscript(
  ctx: JobContext,
  payload: { session_id: string; agent_id: string; agent_transcript_path: string }
): Promise<'done' | 'retry'> {
  const text = safeReadFile(payload.agent_transcript_path, MAX_TRANSCRIPT_BYTES);
  if (text == null) return 'retry';
  const events = tp.parseTranscriptString(text);
  const prompt_text = tp.extractFirstUserPrompt(events);
  const response_text = tp.extractFinalAssistantText(events);
  finishSubagent(ctx.db, payload.session_id, payload.agent_id, {
    prompt_text,
    response_text,
    transcript_path: payload.agent_transcript_path,
  });
  ctx.logger.info(
    { session_id: payload.session_id, agent_id: payload.agent_id, events: events.length },
    'subagent transcript parsed'
  );
  return 'done';
}

export async function handleParseTranscript(
  ctx: JobContext,
  payload: { session_id: string; transcript_path: string }
): Promise<'done' | 'retry'> {
  const text = safeReadFile(payload.transcript_path, MAX_TRANSCRIPT_BYTES);
  if (text == null) return 'retry';
  const events = tp.parseTranscriptString(text);
  const toolSummary = tp.summarizeToolUse(events);

  // Compute usage scores per prompt_usage in this session
  const usages = ctx.db
    .prepare(
      `SELECT id, prompt_hash FROM prompt_usages WHERE session_id = ? ORDER BY turn_index ASC`
    )
    .all(payload.session_id) as Array<{ id: string; prompt_hash: string }>;

  const totalCalls = toolSummary.reduce((a, b) => a + b.calls, 0);
  const rollup = ctx.db
    .prepare(
      `SELECT SUM(call_count) as calls, SUM(fail_count) as fails FROM tool_use_rollups WHERE session_id=?`
    )
    .get(payload.session_id) as { calls: number | null; fails: number | null };
  const calls = rollup.calls ?? totalCalls;
  const fails = rollup.fails ?? 0;

  for (const u of usages) {
    const hashSeenBefore = ctx.db
      .prepare(
        `SELECT COUNT(*) AS c FROM prompt_usages WHERE prompt_hash=? AND session_id=? AND id < ?`
      )
      .get(u.prompt_hash, payload.session_id, u.id) as { c: number };
    const usageScore = computeUsageScore({
      toolCalls: calls,
      toolFails: fails,
      reuseCount: hashSeenBefore.c,
      responseLength: 0, // unknown per-usage without deeper correlation
    });
    const existing = ctx.db
      .prepare(`SELECT rule_score, judge_score FROM quality_scores WHERE usage_id=?`)
      .get(u.id) as { rule_score: number; judge_score: number | null } | undefined;
    if (!existing) continue;
    const { final_score, tier } = composeFinalScore({
      rule_score: existing.rule_score,
      usage_score: usageScore,
      judge_score: existing.judge_score ?? null,
    });
    upsertQualityScore(ctx.db, {
      usage_id: u.id,
      rule_score: existing.rule_score,
      usage_score: usageScore,
      judge_score: existing.judge_score ?? null,
      final_score,
      tier,
      rules_version: 1,
    });
  }
  ctx.logger.info(
    { session_id: payload.session_id, events: events.length, usages: usages.length },
    'session transcript parsed & rescored'
  );
  return 'done';
}

export async function handleSessionEnd(
  ctx: JobContext,
  payload: { session_id: string }
): Promise<'done' | 'retry'> {
  // Enqueue judge jobs for low-scoring prompts in this session, if LLM enabled.
  if (!ctx.config.llm.enabled) return 'done';
  const apiKey = process.env[ctx.config.llm.api_key_env];
  if (!apiKey) return 'done';
  const rows = ctx.db
    .prepare(
      `SELECT q.usage_id
         FROM quality_scores q
         JOIN prompt_usages u ON u.id = q.usage_id
        WHERE u.session_id = ?
          AND q.final_score < ?
          AND q.judge_score IS NULL`
    )
    .all(payload.session_id, ctx.config.llm.judge_threshold_score) as Array<{ usage_id: string }>;

  if (rows.length === 0) return 'done';
  const { enqueue } = await import('@think-prompt/core');
  const { getPaths } = await import('@think-prompt/core');
  const paths = getPaths(ctx.rootOverride);
  for (const r of rows.slice(0, 5)) {
    enqueue(paths.queueFile, 'judge', { usage_id: r.usage_id });
  }
  ctx.logger.info({ session_id: payload.session_id, enqueued: rows.length }, 'judge jobs queued');
  return 'done';
}

const JUDGE_SYSTEM = `You are a precise prompt-quality auditor for developer workflows with Claude Code.
Given a user-typed prompt, score its quality from 0 to 100 across these axes:
- Clarity of intent (25)
- Sufficient context (25)
- Output format specification (20)
- Single focused task (15)
- Success criteria (15)

Return STRICT JSON only, no prose, no code fences:
{"score": <0-100>, "axes": {"clarity":<0-25>,"context":<0-25>,"output":<0-20>,"focus":<0-15>,"criteria":<0-15>}, "top_issue": "<one sentence>", "fix_hint": "<one actionable sentence>"}`;

export async function handleJudge(
  ctx: JobContext,
  payload: { usage_id: string }
): Promise<'done' | 'retry'> {
  if (!ctx.config.llm.enabled) return 'done';
  const apiKey = process.env[ctx.config.llm.api_key_env];
  if (!apiKey) return 'done';
  const u = ctx.db
    .prepare(`SELECT pii_masked, prompt_text, char_len FROM prompt_usages WHERE id=?`)
    .get(payload.usage_id) as
    | { pii_masked: string; prompt_text: string; char_len: number }
    | undefined;
  if (!u) return 'done';
  const existing = ctx.db
    .prepare(`SELECT rule_score, usage_score, judge_score FROM quality_scores WHERE usage_id=?`)
    .get(payload.usage_id) as
    | { rule_score: number; usage_score: number | null; judge_score: number | null }
    | undefined;
  if (!existing) return 'done';
  if (existing.judge_score != null) return 'done';

  const body = `[PROMPT]\n${u.pii_masked}\n[CONTEXT]\nchar_len: ${u.char_len}\n[END]`;
  try {
    const res = await llm.anthropicMessage({
      apiKey,
      model: ctx.config.llm.model,
      system: JUDGE_SYSTEM,
      messages: [{ role: 'user', content: body }],
      maxTokens: 300,
      cacheSystem: true,
    });
    const parsed = llm.parseStrictJson<{ score: number; top_issue?: string; fix_hint?: string }>(
      res.text
    );
    if (!parsed || typeof parsed.score !== 'number') {
      ctx.logger.warn(
        { usage_id: payload.usage_id, text: res.text.slice(0, 200) },
        'judge parse failed'
      );
      return 'done';
    }
    const judgeScore = Math.max(0, Math.min(100, Math.round(parsed.score)));
    const { final_score, tier } = composeFinalScore({
      rule_score: existing.rule_score,
      usage_score: existing.usage_score,
      judge_score: judgeScore,
    });
    upsertQualityScore(ctx.db, {
      usage_id: payload.usage_id,
      rule_score: existing.rule_score,
      usage_score: existing.usage_score,
      judge_score: judgeScore,
      final_score,
      tier,
      rules_version: 1,
    });
    ctx.db
      .prepare(`INSERT INTO audit(id, ts, action, actor, detail) VALUES (?,?,?,?,?)`)
      .run(
        ulid(),
        new Date().toISOString(),
        'judge.ok',
        'worker',
        JSON.stringify({ usage_id: payload.usage_id, judge_score: judgeScore, usage: res.usage })
      );
    return 'done';
  } catch (err) {
    ctx.logger.error({ err }, 'judge failed');
    return 'retry';
  }
}

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

export async function handleRewrite(
  ctx: JobContext,
  payload: { usage_id: string }
): Promise<'done' | 'retry'> {
  if (!ctx.config.llm.enabled) return 'done';
  const apiKey = process.env[ctx.config.llm.api_key_env];
  if (!apiKey) return 'done';
  const u = ctx.db
    .prepare(`SELECT pii_masked, prompt_text FROM prompt_usages WHERE id=?`)
    .get(payload.usage_id) as { pii_masked: string; prompt_text: string } | undefined;
  if (!u) return 'done';
  const hits = ctx.db
    .prepare(`SELECT rule_id, severity, message FROM rule_hits WHERE usage_id=?`)
    .all(payload.usage_id) as Array<{ rule_id: string; severity: number; message: string }>;
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
      model: ctx.config.llm.model,
      system: REWRITE_SYSTEM,
      messages: [{ role: 'user', content: body }],
      maxTokens: 800,
      cacheSystem: true,
    });
    const parsed = llm.parseStrictJson<{
      after_text: string;
      reason?: string;
      applied_fixes?: string[];
    }>(res.text);
    if (!parsed || !parsed.after_text) {
      ctx.logger.warn({ usage_id: payload.usage_id }, 'rewrite parse failed');
      return 'done';
    }
    ctx.db
      .prepare(
        `INSERT INTO rewrites(id, usage_id, before_text, after_text, reason, model, status, created_at)
         VALUES (?,?,?,?,?,?,?,?)`
      )
      .run(
        ulid(),
        payload.usage_id,
        u.prompt_text,
        parsed.after_text,
        parsed.reason ?? null,
        ctx.config.llm.model,
        'proposed',
        new Date().toISOString()
      );
    return 'done';
  } catch (err) {
    ctx.logger.error({ err }, 'rewrite failed');
    return 'retry';
  }
}

export type JobHandler = (ctx: JobContext, payload: any) => Promise<'done' | 'retry'>;
export const HANDLERS: Record<string, JobHandler> = {
  parse_subagent_transcript: handleParseSubagentTranscript as JobHandler,
  parse_transcript: handleParseTranscript as JobHandler,
  session_end: handleSessionEnd as JobHandler,
  judge: handleJudge as JobHandler,
  rewrite: handleRewrite as JobHandler,
};
