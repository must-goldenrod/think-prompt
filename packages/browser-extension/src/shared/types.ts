/**
 * Shared message types between content scripts ↔ background service worker.
 */

export type SiteId = 'chatgpt' | 'claude-ai' | 'gemini' | 'perplexity' | 'genspark';

/**
 * Maximum number of characters a captured prompt may carry before content
 * scripts truncate it. Large paste-ins (logs, dumps, books) would otherwise
 * blow past the agent's bodyLimit and end up poisoned in the retry queue.
 *
 * 128 KiB of UTF-8 is a generous upper bound — real prompts are <2 KiB.
 */
export const MAX_PROMPT_CHARS = 128 * 1024;

export interface CapturedPrompt {
  source: SiteId;
  browser_session_id: string;
  prompt_text: string;
  captured_at: string;
  /** Set when the content script had to cut an oversized paste. */
  truncated?: true;
}

export interface IngestResult {
  ok: boolean;
  /** Present when the local agent accepted the prompt and returned a score. */
  tier?: 'good' | 'ok' | 'weak' | 'bad';
  score?: number;
  hits?: Array<{ rule_id: string; severity: number; message: string }>;
  /** Present only when the local agent is unreachable and we queued the row. */
  queued?: true;
  /** Present when the user has turned capture off for this site in Options. */
  disabled?: true;
  /** Optional error message surfaced to content-script callers. */
  error?: string;
}

export type Message =
  | { kind: 'prompt'; payload: CapturedPrompt }
  | { kind: 'content-loaded'; source: SiteId }
  | { kind: 'stats' }
  | { kind: 'sync-now' }
  | { kind: 'retry-poisoned' }
  | { kind: 'clear-all' };

/** chrome.storage.local key for the per-site on/off toggle (read by background). */
export const SITE_TOGGLE_STORAGE_KEY = 'think-prompt:sites';

/**
 * Runtime guard for inbound messages. Rejects anything that doesn't match
 * the discriminated union so a buggy/malicious content script or another
 * extension's stray `sendMessage` cannot feed the pipeline.
 */
export function isValidMessage(input: unknown): input is Message {
  if (!input || typeof input !== 'object') return false;
  const m = input as { kind?: unknown };
  switch (m.kind) {
    case 'stats':
    case 'sync-now':
    case 'retry-poisoned':
    case 'clear-all':
      return true;
    case 'content-loaded':
      return typeof (m as { source?: unknown }).source === 'string';
    case 'prompt': {
      const p = (m as { payload?: { [k: string]: unknown } }).payload;
      if (!p || typeof p !== 'object') return false;
      return (
        typeof p.source === 'string' &&
        typeof p.browser_session_id === 'string' &&
        typeof p.prompt_text === 'string' &&
        typeof p.captured_at === 'string' &&
        p.prompt_text.length > 0 &&
        p.prompt_text.length <= MAX_PROMPT_CHARS
      );
    }
    default:
      return false;
  }
}
