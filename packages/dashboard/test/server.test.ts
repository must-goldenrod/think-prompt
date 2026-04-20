import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { insertPromptUsage, openDb, upsertQualityScore, upsertSession } from '@think-prompt/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildDashboardServer } from '../src/server.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'pp-dash-'));
  process.env.THINK_PROMPT_HOME = tmp;
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  delete process.env.THINK_PROMPT_HOME;
});

describe('dashboard', () => {
  it('renders overview with data', async () => {
    const db = openDb();
    upsertSession(db, { id: 's1', cwd: '/tmp' });
    const u = insertPromptUsage(db, { session_id: 's1', prompt_text: 'hello world' });
    upsertQualityScore(db, {
      usage_id: u.id,
      rule_score: 80,
      final_score: 80,
      tier: 'ok',
      rules_version: 1,
    });
    db.close();

    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Overview');
    expect(res.body).toContain('Total prompts');
    await app.close();
  });

  it('renders prompt detail', async () => {
    const db = openDb();
    upsertSession(db, { id: 's1', cwd: '/tmp' });
    const u = insertPromptUsage(db, { session_id: 's1', prompt_text: 'fix' });
    upsertQualityScore(db, {
      usage_id: u.id,
      rule_score: 50,
      final_score: 50,
      tier: 'weak',
      rules_version: 1,
    });
    db.close();

    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: `/prompts/${u.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Prompt');
    expect(res.body).toContain('fix');
    await app.close();
  });

  it('renders rules catalog', async () => {
    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({ method: 'GET', url: '/rules' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Rule catalog');
    expect(res.body).toContain('R001');
    await app.close();
  });

  it('records feedback via POST /prompts/:id/feedback', async () => {
    const db = openDb();
    upsertSession(db, { id: 's-fb', cwd: '/tmp' });
    const u = insertPromptUsage(db, { session_id: 's-fb', prompt_text: 'fix' });
    db.close();

    const app = buildDashboardServer({ rootOverride: tmp });
    const res = await app.inject({
      method: 'POST',
      url: `/prompts/${u.id}/feedback`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'rating=up',
    });
    expect([200, 302]).toContain(res.statusCode);

    const db2 = openDb();
    const count = db2
      .prepare(`SELECT COUNT(*) AS c FROM outcomes WHERE usage_id=? AND rating='up'`)
      .get(u.id) as { c: number };
    expect(count.c).toBe(1);
    db2.close();
    await app.close();
  });
});
