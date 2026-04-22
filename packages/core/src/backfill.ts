import { createHash } from 'node:crypto';
/**
 * Claude Code history backfill — scans `~/.claude/projects/**\/*.jsonl` and
 * reports how many user prompts are there, how many are already present in
 * the Think-Prompt DB, and how many would be new imports.
 *
 * This module is SCAN-ONLY (dry-run). Actual inserts will ship in a
 * follow-up that wires the scanner to insertPromptUsage.
 *
 * Layout observed on macOS:
 *   ~/.claude/projects/
 *     -Users-alice-repo/                 ← cwd-encoded path segment
 *       <session-uuid>.jsonl             ← one session transcript
 *       <another-uuid>.jsonl
 *
 * Schema of a `type: "user"` entry (confirmed from live data):
 *   {
 *     type: "user",
 *     message: { role: "user", content: "<string>" | <content-block-array> },
 *     sessionId: "<uuid>",
 *     timestamp: "2026-04-15T11:21:54.972Z",
 *     cwd: "/Users/alice/repo",
 *     gitBranch: "main",
 *     version: "2.1.109",
 *     ...
 *   }
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Database as Db } from 'better-sqlite3';

export interface BackfillScanOptions {
  /** Override the Claude projects root. Default: `~/.claude/projects`. */
  root?: string;
  /** Stop after scanning this many .jsonl files (0 = no limit). */
  limit?: number;
  /** Skip prompts older than this ISO date string. */
  since?: string;
  /** Only scan sessions whose cwd contains this substring. */
  projectFilter?: string;
}

export interface BackfillCandidate {
  /** Original Claude sessionId (UUID). */
  sessionId: string;
  /** Working directory recorded at capture time. */
  cwd: string;
  /** ISO timestamp from the JSONL entry. */
  timestamp: string;
  /** User prompt text, content array flattened to string if needed. */
  promptText: string;
  /** SHA-256 of promptText, hex. Used to dedupe against DB. */
  promptHash: string;
  /** File path the candidate came from (for debugging). */
  sourceFile: string;
}

export interface BackfillStats {
  /** Root directory that was scanned. */
  root: string;
  /** Whether the root existed. */
  rootExists: boolean;
  /** Number of .jsonl files we touched. */
  filesScanned: number;
  /** Number of .jsonl files that had at least one user prompt. */
  filesWithPrompts: number;
  /** Files we tried to read but could not parse a single entry from. */
  filesFailed: number;
  /** Raw count of `type: "user"` entries found. */
  totalUserEntries: number;
  /** Entries whose `message.content` yielded a non-empty text. */
  extractablePrompts: number;
  /** Prompts whose hash is already present in prompt_usages. */
  alreadyInDb: number;
  /** Prompts that would be imported if --execute ran today. */
  newPrompts: number;
  /** Prompts skipped because of --since cutoff. */
  skippedBySince: number;
  /** Distinct sessionIds observed. */
  distinctSessions: number;
  /** Earliest timestamp seen (for the UI "data goes back to …"). */
  earliestTimestamp: string | null;
  /** Latest timestamp seen. */
  latestTimestamp: string | null;
}

/**
 * Walk the Claude projects directory and compute import statistics.
 * Does NOT write to the DB; takes an optional `db` to check for duplicates.
 */
export function scanClaudeHistory(db: Db | null, opts: BackfillScanOptions = {}): BackfillStats {
  const root = opts.root ?? join(homedir(), '.claude', 'projects');

  const stats: BackfillStats = {
    root,
    rootExists: existsSync(root),
    filesScanned: 0,
    filesWithPrompts: 0,
    filesFailed: 0,
    totalUserEntries: 0,
    extractablePrompts: 0,
    alreadyInDb: 0,
    newPrompts: 0,
    skippedBySince: 0,
    distinctSessions: 0,
    earliestTimestamp: null,
    latestTimestamp: null,
  };

  if (!stats.rootExists) return stats;

  // Collect .jsonl paths up-front so the caller can reason about totals
  // before we start streaming. At ~1,000 sessions this is cheap.
  const files = collectJsonlFiles(root, opts.projectFilter);
  const cap = opts.limit && opts.limit > 0 ? Math.min(files.length, opts.limit) : files.length;

  // Cache of all prompt_hashes currently in the DB so we do one SELECT not
  // N SELECTs. O(N) memory but N is our OWN row count, usually small
  // relative to the history being imported.
  const hashSet = loadExistingHashes(db);

  const sessionSet = new Set<string>();

  for (let i = 0; i < cap; i++) {
    const path = files[i];
    if (!path) continue;
    stats.filesScanned++;

    const perFile = scanFile(path, opts.since);
    if (perFile.failed) {
      stats.filesFailed++;
      continue;
    }
    if (perFile.prompts.length > 0) stats.filesWithPrompts++;
    stats.totalUserEntries += perFile.userEntries;
    stats.skippedBySince += perFile.skippedBySince;

    for (const c of perFile.prompts) {
      stats.extractablePrompts++;
      sessionSet.add(c.sessionId);
      if (hashSet.has(c.promptHash)) {
        stats.alreadyInDb++;
      } else {
        stats.newPrompts++;
      }
      if (!stats.earliestTimestamp || c.timestamp < stats.earliestTimestamp) {
        stats.earliestTimestamp = c.timestamp;
      }
      if (!stats.latestTimestamp || c.timestamp > stats.latestTimestamp) {
        stats.latestTimestamp = c.timestamp;
      }
    }
  }

  stats.distinctSessions = sessionSet.size;
  return stats;
}

/**
 * Enumerate one .jsonl at a time so a caller can build a streaming importer
 * later without re-implementing this walk. Yields relative & absolute paths.
 */
export function* iterateClaudeJsonl(
  root = join(homedir(), '.claude', 'projects')
): Generator<string> {
  if (!existsSync(root)) return;
  for (const p of collectJsonlFiles(root)) yield p;
}

/**
 * Parse one JSONL file and return candidates. Exported for tests + the
 * future --execute path that will feed these into insertPromptUsage.
 */
export function parseSessionFile(
  path: string,
  since?: string
): { failed: boolean; userEntries: number; skippedBySince: number; prompts: BackfillCandidate[] } {
  return scanFile(path, since);
}

// ---------------- internals ---------------------------------------------

function collectJsonlFiles(root: string, projectFilter?: string): string[] {
  const out: string[] = [];
  let projectDirs: string[];
  try {
    projectDirs = readdirSync(root).map((d) => join(root, d));
  } catch {
    return out;
  }
  for (const dir of projectDirs) {
    let isDir = false;
    try {
      isDir = statSync(dir).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;
    if (projectFilter && !dir.includes(projectFilter)) continue;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.endsWith('.jsonl')) out.push(join(dir, e));
    }
  }
  // Deterministic order for testability.
  out.sort();
  return out;
}

function scanFile(
  path: string,
  since?: string
): { failed: boolean; userEntries: number; skippedBySince: number; prompts: BackfillCandidate[] } {
  const sinceTs = since ? normalizeIsoDate(since) : null;
  const prompts: BackfillCandidate[] = [];
  let userEntries = 0;
  let skippedBySince = 0;

  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return { failed: true, userEntries: 0, skippedBySince: 0, prompts };
  }

  // Stream line-by-line so a 50 MB session file doesn't blow memory into
  // a single giant JSON blob in a retained array. (The file is still
  // read into memory once — that's unavoidable with synchronous fs.)
  const lines = text.split('\n');
  let parsedAny = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(trimmed) as Record<string, unknown>;
      parsedAny = true;
    } catch {
      continue;
    }
    if (obj.type !== 'user') continue;
    userEntries++;

    const timestamp = typeof obj.timestamp === 'string' ? obj.timestamp : undefined;
    if (!timestamp) continue;
    if (sinceTs && timestamp < sinceTs) {
      skippedBySince++;
      continue;
    }

    const sessionId = typeof obj.sessionId === 'string' ? obj.sessionId : '';
    const cwd = typeof obj.cwd === 'string' ? obj.cwd : '';
    if (!sessionId || !cwd) continue;

    const promptText = extractUserText(obj);
    if (!promptText) continue;

    prompts.push({
      sessionId,
      cwd,
      timestamp,
      promptText,
      promptHash: sha256Hex(promptText),
      sourceFile: path,
    });
  }

  return { failed: !parsedAny, userEntries, skippedBySince, prompts };
}

function extractUserText(entry: Record<string, unknown>): string | null {
  const message = (entry.message ?? entry) as Record<string, unknown>;
  const content = message.content ?? entry.content;
  if (typeof content === 'string') {
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (typeof item === 'string') parts.push(item);
      else if (item && typeof item === 'object') {
        const t = (item as Record<string, unknown>).text;
        if (typeof t === 'string') parts.push(t);
      }
    }
    const joined = parts.join('\n').trim();
    return joined.length > 0 ? joined : null;
  }
  return null;
}

function loadExistingHashes(db: Db | null): Set<string> {
  const out = new Set<string>();
  if (!db) return out;
  try {
    const rows = db
      .prepare(`SELECT prompt_hash FROM prompt_usages WHERE prompt_hash IS NOT NULL`)
      .all() as Array<{ prompt_hash: string | null }>;
    for (const r of rows) {
      if (r.prompt_hash) out.add(r.prompt_hash);
    }
  } catch {
    // Schema mismatch or missing table — return empty set and treat
    // everything as new.
  }
  return out;
}

function normalizeIsoDate(raw: string): string {
  // Accept `YYYY-MM-DD` and produce an ISO instant for lexicographic compare.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T00:00:00.000Z`;
  return raw;
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
