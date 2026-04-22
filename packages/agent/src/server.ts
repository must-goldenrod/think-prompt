import {
  type Config,
  PostToolUsePayload,
  SessionStartPayload,
  StopPayload,
  SubagentStartPayload,
  SubagentStopPayload,
  UserPromptSubmitPayload,
  WebIngestPayload,
  bumpToolRollup,
  createLogger,
  endSession,
  enqueue,
  finishSubagent,
  getPaths,
  insertPromptUsage,
  insertRuleHit,
  loadConfig,
  openDb,
  upsertQualityScore,
  upsertSession,
  upsertSubagent,
} from '@think-prompt/core';
import { composeFinalScore, computeRuleScore } from '@think-prompt/core';
import { runRules } from '@think-prompt/rules';
import Fastify, { type FastifyInstance } from 'fastify';

export interface AgentDeps {
  config?: Config;
  rootOverride?: string;
}

export function buildAgentServer(deps: AgentDeps = {}): FastifyInstance {
  const config = deps.config ?? loadConfig(deps.rootOverride);
  const paths = getPaths(deps.rootOverride);
  const logger = createLogger('agent', { file: paths.agentLog, stdout: false });

  const fastify = Fastify({ logger: false, bodyLimit: config.agent.max_prompt_bytes + 16 * 1024 });
  const db = openDb(deps.rootOverride);

  // ---------------------------------------------------------------------
  // CORS / Private Network Access for the browser-extension endpoint.
  //
  // The extension runs under `chrome-extension://<id>` and POSTs with a
  // custom `X-Think-Prompt-Ext` header. Browsers treat that as a
  // non-simple cross-origin request, so they send a preflight OPTIONS.
  // Chrome 104+ also requires `Access-Control-Allow-Private-Network: true`
  // when the origin is public-facing and the target is loopback.
  //
  // fastify.inject() bypasses this path (that's why the unit tests were
  // green without any CORS handling) — but a real browser WILL fail without
  // these headers. See docs/09-browser-extension-design.md §7.3.
  // ---------------------------------------------------------------------
  fastify.addHook('onSend', async (req, reply, payload) => {
    if (!req.url.startsWith('/v1/ingest/web')) return payload;
    const origin = (req.headers.origin as string | undefined) ?? '*';
    reply.header('access-control-allow-origin', origin);
    reply.header('access-control-allow-methods', 'POST, OPTIONS');
    reply.header('access-control-allow-headers', 'content-type, x-think-prompt-ext');
    reply.header('access-control-allow-private-network', 'true');
    reply.header('vary', 'origin');
    return payload;
  });

  fastify.route({
    method: 'OPTIONS',
    url: '/v1/ingest/web',
    handler: async (_req, reply) => {
      reply.code(204).send();
    },
  });

  fastify.get('/health', async () => ({
    ok: true,
    pid: process.pid,
    port: config.agent.port,
  }));

  fastify.post('/v1/hook/session-start', async (req) => {
    try {
      const p = SessionStartPayload.parse(req.body);
      upsertSession(db, {
        id: p.session_id,
        cwd: p.cwd ?? process.cwd(),
        model: p.model ?? null,
        source: p.source ?? null,
        transcript_path: p.transcript_path ?? null,
      });
      logger.info({ session_id: p.session_id, source: p.source }, 'session-start');
      return {};
    } catch (err) {
      logger.error({ err }, 'session-start failed');
      if (config.agent.fail_open) return {};
      throw err;
    }
  });

  fastify.post('/v1/hook/user-prompt-submit', async (req) => {
    const t0 = Date.now();
    try {
      const p = UserPromptSubmitPayload.parse(req.body);
      upsertSession(db, {
        id: p.session_id,
        cwd: p.cwd ?? process.cwd(),
        transcript_path: p.transcript_path ?? null,
      });
      const usage = insertPromptUsage(db, {
        session_id: p.session_id,
        prompt_text: p.prompt,
      });

      // Parse the PII hits JSON we stored on the usage row so R013 can see it.
      let piiHits: Record<string, number> | undefined;
      if (usage.pii_hits) {
        try {
          const parsed = JSON.parse(usage.pii_hits);
          if (parsed && typeof parsed === 'object') piiHits = parsed;
        } catch {
          // ignore — rule just won't fire
        }
      }
      const hits = runRules({
        promptText: p.prompt,
        session: { cwd: p.cwd ?? '/' },
        meta: {
          charLen: usage.char_len,
          wordCount: usage.word_count,
          piiHits,
        },
      });
      for (const h of hits) {
        insertRuleHit(db, {
          usage_id: usage.id,
          rule_id: h.ruleId,
          severity: h.severity,
          message: h.message,
          evidence: h.evidence ?? undefined,
        });
      }
      const ruleScore = computeRuleScore(hits);
      const { final_score, tier } = composeFinalScore({
        rule_score: ruleScore,
        usage_score: null,
        judge_score: null,
      });
      upsertQualityScore(db, {
        usage_id: usage.id,
        rule_score: ruleScore,
        final_score,
        tier,
        rules_version: 1,
      });

      // Coaching hint injection (D-021)
      // Response must follow Claude Code UserPromptSubmit hook spec:
      //   { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: "..." } }
      // See https://code.claude.com/docs/en/hooks (UserPromptSubmit).
      let response: Record<string, unknown> = {};
      if (config.agent.coach_mode && (final_score < 65 || hits.some((h) => h.severity >= 3))) {
        const issueLines = hits
          .filter((h) => h.severity >= 2)
          .slice(0, 4)
          .map((h) => `- ${h.ruleId} (${h.ruleName}): ${h.message}`)
          .join('\n');
        const hint = [
          '[Think-Prompt coaching hint]',
          "The user's prompt has these quality issues (from local rule checks):",
          issueLines,
          '',
          'Before answering, briefly confirm with the user what is missing (context/format/constraints),',
          'or proceed while explicitly stating your assumptions.',
          '[end hint]',
        ].join('\n');
        response = {
          hookSpecificOutput: {
            hookEventName: 'UserPromptSubmit',
            additionalContext: hint,
          },
        };
        db.prepare(`UPDATE prompt_usages SET coach_context=? WHERE id=?`).run(hint, usage.id);
      }

      const ms = Date.now() - t0;
      logger.info(
        {
          session_id: p.session_id,
          usage_id: usage.id,
          score: final_score,
          tier,
          hits: hits.length,
          ms,
        },
        'user-prompt-submit'
      );
      return response;
    } catch (err) {
      logger.error({ err }, 'user-prompt-submit failed');
      if (config.agent.fail_open) return {};
      throw err;
    }
  });

  fastify.post('/v1/hook/subagent-start', async (req) => {
    try {
      const p = SubagentStartPayload.parse(req.body);
      upsertSession(db, { id: p.session_id, cwd: p.cwd ?? '/' });
      upsertSubagent(db, {
        session_id: p.session_id,
        agent_type: p.agent_type,
        agent_id: p.agent_id,
      });
      logger.info({ session_id: p.session_id, agent_type: p.agent_type }, 'subagent-start');
      return {};
    } catch (err) {
      logger.error({ err }, 'subagent-start failed');
      if (config.agent.fail_open) return {};
      throw err;
    }
  });

  fastify.post('/v1/hook/subagent-stop', async (req) => {
    try {
      const p = SubagentStopPayload.parse(req.body);
      // Defensive: subagent-start may have been missed (different daemon
      // instance, restart, or Claude Code skipping the start hook). Ensure
      // the parent session row exists before the FK-bound subagents insert.
      upsertSession(db, { id: p.session_id, cwd: p.cwd ?? '/' });
      upsertSubagent(db, {
        session_id: p.session_id,
        agent_type: p.agent_type,
        agent_id: p.agent_id,
        transcript_path: p.agent_transcript_path ?? null,
      });
      if (p.agent_transcript_path) {
        enqueue(paths.queueFile, 'parse_subagent_transcript', {
          session_id: p.session_id,
          agent_id: p.agent_id,
          agent_transcript_path: p.agent_transcript_path,
        });
      } else {
        // mark completed even without transcript
        finishSubagent(db, p.session_id, p.agent_id, {});
      }
      logger.info({ session_id: p.session_id, agent_id: p.agent_id }, 'subagent-stop');
      return {};
    } catch (err) {
      logger.error({ err }, 'subagent-stop failed');
      if (config.agent.fail_open) return {};
      throw err;
    }
  });

  fastify.post('/v1/hook/post-tool-use', async (req) => {
    try {
      const p = PostToolUsePayload.parse(req.body);
      const inputSize = JSON.stringify(p.tool_input ?? '').length;
      const outputSize = JSON.stringify(p.tool_response ?? '').length;
      bumpToolRollup(db, {
        session_id: p.session_id,
        tool_name: p.tool_name,
        failed: false,
        ms: 0,
        in_bytes: inputSize,
        out_bytes: outputSize,
      });
      return {};
    } catch (err) {
      logger.error({ err }, 'post-tool-use failed');
      if (config.agent.fail_open) return {};
      throw err;
    }
  });

  fastify.post('/v1/hook/stop', async (req) => {
    try {
      const p = StopPayload.parse(req.body);
      endSession(db, p.session_id);
      if (p.transcript_path) {
        enqueue(paths.queueFile, 'parse_transcript', {
          session_id: p.session_id,
          transcript_path: p.transcript_path,
        });
      }
      enqueue(paths.queueFile, 'session_end', { session_id: p.session_id });
      logger.info({ session_id: p.session_id }, 'stop');
      return {};
    } catch (err) {
      logger.error({ err }, 'stop failed');
      if (config.agent.fail_open) return {};
      throw err;
    }
  });

  // /v1/ingest/web — prompts captured by the browser extension.
  // See docs/09-browser-extension-design.md §7.
  //
  // Soft-auth via the `X-Think-Prompt-Ext` header: the agent binds to 127.0.0.1
  // so network attackers are already blocked, but unrelated local processes
  // (or a drive-by fetch from an unrelated browser tab) should not be able to
  // pollute the local store. The browser extension sets this header on every
  // call; anything missing it gets a 403.
  fastify.post('/v1/ingest/web', async (req, reply) => {
    const t0 = Date.now();
    const extHeader = req.headers['x-think-prompt-ext'];
    if (extHeader !== '1') {
      logger.warn({ hasHeader: extHeader != null }, 'web-ingest rejected — missing ext header');
      reply.code(403);
      return { ok: false, error: 'missing X-Think-Prompt-Ext header' };
    }
    try {
      const p = WebIngestPayload.parse(req.body);
      const sessionId = `${p.source}:${p.browser_session_id}`;

      upsertSession(db, {
        id: sessionId,
        cwd: `web:${p.source}`,
        source: p.source,
      });

      const usage = insertPromptUsage(db, {
        session_id: sessionId,
        prompt_text: p.prompt_text,
        browser_session_id: p.browser_session_id,
      });

      // Parse PII hits already computed by the extension (if any) + merge
      // with server-side masker which runs inside insertPromptUsage.
      let piiHits: Record<string, number> | undefined;
      if (usage.pii_hits) {
        try {
          const parsed = JSON.parse(usage.pii_hits);
          if (parsed && typeof parsed === 'object') {
            piiHits = parsed as Record<string, number>;
          }
        } catch {
          // ignore
        }
      }
      if (p.pii_hits) {
        piiHits = { ...(piiHits ?? {}), ...p.pii_hits };
      }

      const hits = runRules({
        promptText: p.prompt_text,
        session: { cwd: `web:${p.source}` },
        meta: {
          charLen: usage.char_len,
          wordCount: usage.word_count,
          piiHits,
        },
      });
      for (const h of hits) {
        insertRuleHit(db, {
          usage_id: usage.id,
          rule_id: h.ruleId,
          severity: h.severity,
          message: h.message,
          evidence: h.evidence ?? undefined,
        });
      }
      const ruleScore = computeRuleScore(hits);
      const { final_score, tier } = composeFinalScore({
        rule_score: ruleScore,
        usage_score: null,
        judge_score: null,
      });
      upsertQualityScore(db, {
        usage_id: usage.id,
        rule_score: ruleScore,
        final_score,
        tier,
        rules_version: 1,
      });

      const ms = Date.now() - t0;
      logger.info(
        {
          source: p.source,
          browser_session_id: p.browser_session_id,
          usage_id: usage.id,
          score: final_score,
          tier,
          hits: hits.length,
          ms,
        },
        'web-ingest'
      );
      return {
        ok: true,
        usage_id: usage.id,
        score: final_score,
        tier,
        hits: hits.map((h) => ({ rule_id: h.ruleId, severity: h.severity, message: h.message })),
      };
    } catch (err) {
      logger.error({ err }, 'web-ingest failed');
      if (config.agent.fail_open) return { ok: false };
      throw err;
    }
  });

  fastify.addHook('onClose', async () => {
    try {
      db.close();
    } catch {
      // ignore
    }
  });

  return fastify;
}
