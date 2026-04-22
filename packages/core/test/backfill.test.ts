import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSessionFile, scanClaudeHistory } from '../src/backfill.js';
import { insertPromptUsage, openDb, upsertSession } from '../src/db.js';

/** Build a fake `~/.claude/projects/<project>/<session>.jsonl` hierarchy. */
function setupFixtureRoot(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'tp-backfill-'));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function writeSessionFile(
  root: string,
  projectDir: string,
  sessionId: string,
  entries: Array<Record<string, unknown>>
): string {
  const dir = join(root, projectDir);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${sessionId}.jsonl`);
  const body = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
  writeFileSync(path, body, 'utf8');
  return path;
}

function userEntry(
  sessionId: string,
  cwd: string,
  timestamp: string,
  content: unknown
): Record<string, unknown> {
  return {
    type: 'user',
    message: { role: 'user', content },
    sessionId,
    cwd,
    timestamp,
    gitBranch: 'main',
    version: '2.1.109',
    uuid: `u-${Math.random().toString(36).slice(2)}`,
  };
}

describe('scanClaudeHistory', () => {
  it('returns rootExists=false when the directory is absent', () => {
    const { root, cleanup } = setupFixtureRoot();
    cleanup(); // remove it so it doesn't exist
    const stats = scanClaudeHistory(null, { root });
    expect(stats.rootExists).toBe(false);
    expect(stats.filesScanned).toBe(0);
  });

  it('counts user prompts in a single session file', () => {
    const { root, cleanup } = setupFixtureRoot();
    try {
      writeSessionFile(root, '-proj-a', 'session-1', [
        userEntry('session-1', '/proj/a', '2026-04-01T10:00:00.000Z', 'git pull'),
        userEntry('session-1', '/proj/a', '2026-04-01T10:05:00.000Z', 'run tests'),
        // An assistant entry must be ignored.
        {
          type: 'assistant',
          message: { role: 'assistant', content: 'ok' },
          sessionId: 'session-1',
          cwd: '/proj/a',
          timestamp: '2026-04-01T10:00:10.000Z',
        },
      ]);
      const stats = scanClaudeHistory(null, { root });
      expect(stats.rootExists).toBe(true);
      expect(stats.filesScanned).toBe(1);
      expect(stats.filesWithPrompts).toBe(1);
      expect(stats.totalUserEntries).toBe(2);
      expect(stats.extractablePrompts).toBe(2);
      expect(stats.newPrompts).toBe(2);
      expect(stats.alreadyInDb).toBe(0);
      expect(stats.distinctSessions).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('dedupes against existing prompt_hash in the DB', () => {
    const { root, cleanup } = setupFixtureRoot();
    const dbTmp = mkdtempSync(join(tmpdir(), 'tp-backfill-db-'));
    try {
      writeSessionFile(root, '-proj-b', 'session-2', [
        userEntry('session-2', '/proj/b', '2026-04-02T09:00:00.000Z', 'already imported'),
        userEntry('session-2', '/proj/b', '2026-04-02T09:05:00.000Z', 'brand new prompt'),
      ]);
      const db = openDb(dbTmp);
      upsertSession(db, { id: 'earlier-session', cwd: '/proj/b' });
      insertPromptUsage(db, { session_id: 'earlier-session', prompt_text: 'already imported' });

      const stats = scanClaudeHistory(db, { root });
      expect(stats.extractablePrompts).toBe(2);
      expect(stats.alreadyInDb).toBe(1);
      expect(stats.newPrompts).toBe(1);
      db.close();
    } finally {
      cleanup();
      rmSync(dbTmp, { recursive: true, force: true });
    }
  });

  it('honours --since and skips older prompts', () => {
    const { root, cleanup } = setupFixtureRoot();
    try {
      writeSessionFile(root, '-proj-c', 'session-3', [
        userEntry('session-3', '/proj/c', '2026-03-15T00:00:00.000Z', 'old prompt'),
        userEntry('session-3', '/proj/c', '2026-04-05T00:00:00.000Z', 'new enough prompt'),
      ]);
      const stats = scanClaudeHistory(null, { root, since: '2026-04-01' });
      expect(stats.extractablePrompts).toBe(1);
      expect(stats.skippedBySince).toBe(1);
      expect(stats.totalUserEntries).toBe(2);
    } finally {
      cleanup();
    }
  });

  it('respects --limit on the number of files', () => {
    const { root, cleanup } = setupFixtureRoot();
    try {
      for (let i = 0; i < 5; i++) {
        writeSessionFile(root, `-proj-${i}`, `session-${i}`, [
          userEntry(`session-${i}`, `/p/${i}`, `2026-04-0${i + 1}T00:00:00.000Z`, `prompt ${i}`),
        ]);
      }
      const stats = scanClaudeHistory(null, { root, limit: 2 });
      expect(stats.filesScanned).toBe(2);
      expect(stats.extractablePrompts).toBe(2);
    } finally {
      cleanup();
    }
  });

  it('filters by --project substring', () => {
    const { root, cleanup } = setupFixtureRoot();
    try {
      writeSessionFile(root, '-repo-alpha', 'session-a', [
        userEntry('session-a', '/repo/alpha', '2026-04-02T00:00:00.000Z', 'alpha'),
      ]);
      writeSessionFile(root, '-repo-beta', 'session-b', [
        userEntry('session-b', '/repo/beta', '2026-04-02T00:00:00.000Z', 'beta'),
      ]);
      const stats = scanClaudeHistory(null, { root, projectFilter: 'alpha' });
      expect(stats.filesScanned).toBe(1);
      expect(stats.extractablePrompts).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('extracts text from content-block arrays, not just strings', () => {
    const { root, cleanup } = setupFixtureRoot();
    try {
      writeSessionFile(root, '-proj-d', 'session-4', [
        userEntry('session-4', '/proj/d', '2026-04-10T00:00:00.000Z', [
          { type: 'text', text: 'multi' },
          { type: 'text', text: 'part' },
        ]),
      ]);
      const { prompts } = parseSessionFile(join(root, '-proj-d', 'session-4.jsonl'));
      expect(prompts).toHaveLength(1);
      expect(prompts[0]?.promptText).toBe('multi\npart');
    } finally {
      cleanup();
    }
  });

  it('skips malformed JSONL lines without failing the whole file', () => {
    const { root, cleanup } = setupFixtureRoot();
    try {
      const dir = join(root, '-proj-e');
      mkdirSync(dir, { recursive: true });
      const content = [
        JSON.stringify(userEntry('s5', '/proj/e', '2026-04-11T00:00:00.000Z', 'good')),
        '{ broken json',
        JSON.stringify(userEntry('s5', '/proj/e', '2026-04-12T00:00:00.000Z', 'also good')),
      ].join('\n');
      writeFileSync(join(dir, 'session-5.jsonl'), content, 'utf8');

      const stats = scanClaudeHistory(null, { root });
      expect(stats.filesFailed).toBe(0);
      expect(stats.extractablePrompts).toBe(2);
    } finally {
      cleanup();
    }
  });

  it('tracks the earliest and latest timestamps across files', () => {
    const { root, cleanup } = setupFixtureRoot();
    try {
      writeSessionFile(root, '-p1', 's1', [
        userEntry('s1', '/p1', '2026-01-01T00:00:00.000Z', 'a'),
      ]);
      writeSessionFile(root, '-p2', 's2', [
        userEntry('s2', '/p2', '2026-06-30T00:00:00.000Z', 'b'),
      ]);
      const stats = scanClaudeHistory(null, { root });
      expect(stats.earliestTimestamp).toBe('2026-01-01T00:00:00.000Z');
      expect(stats.latestTimestamp).toBe('2026-06-30T00:00:00.000Z');
    } finally {
      cleanup();
    }
  });
});
