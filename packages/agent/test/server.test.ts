import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildAgentServer } from '../src/server.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'pp-agent-'));
  process.env.THINK_PROMPT_HOME = tmp;
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  delete process.env.THINK_PROMPT_HOME;
});

describe('agent server', () => {
  it('health endpoint works', async () => {
    const app = buildAgentServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    await app.close();
  });

  it('user-prompt-submit stores + scores', async () => {
    const app = buildAgentServer({ rootOverride: tmp });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/hook/user-prompt-submit',
      payload: {
        session_id: 't1',
        cwd: '/tmp',
        prompt: 'fix',
      },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('coach_mode injects additionalContext for bad prompts', async () => {
    const app = buildAgentServer({
      rootOverride: tmp,
      config: {
        version: 1,
        agent: { port: 0, max_prompt_bytes: 262144, coach_mode: true, fail_open: true },
        dashboard: { port: 47824, open_on_start: false },
        privacy: {
          store_original: true,
          pii_mask: true,
          retention_days: 90,
          sync_to_server: false,
        },
        llm: {
          enabled: false,
          provider: 'anthropic',
          model: 'claude-haiku-4-5',
          api_key_env: 'ANTHROPIC_API_KEY',
          judge_threshold_score: 60,
          max_monthly_tokens: 500000,
        },
        rules: { enabled_set: 'default', custom_disabled: [] },
        i18n: 'ko',
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/hook/user-prompt-submit',
      payload: {
        session_id: 't2',
        cwd: '/tmp',
        prompt: 'fix',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.additionalContext).toContain('Think-Prompt coaching hint');
    await app.close();
  });

  it('subagent-stop enqueues parse job', async () => {
    const app = buildAgentServer({ rootOverride: tmp });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/hook/subagent-stop',
      payload: {
        session_id: 't3',
        agent_id: 'a1',
        agent_type: 'Explore',
        agent_transcript_path: '/tmp/fake.jsonl',
      },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
