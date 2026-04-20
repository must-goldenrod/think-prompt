import {
  type Config,
  PostToolUsePayload,
  SessionStartPayload,
  StopPayload,
  SubagentStartPayload,
  SubagentStopPayload,
  UserPromptSubmitPayload,
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

      const hits = runRules({
        promptText: p.prompt,
        session: { cwd: p.cwd ?? '/' },
        meta: { charLen: usage.char_len, wordCount: usage.word_count },
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
        response = { additionalContext: hint };
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

  fastify.addHook('onClose', async () => {
    try {
      db.close();
    } catch {
      // ignore
    }
  });

  return fastify;
}
