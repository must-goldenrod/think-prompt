/**
 * Shared message types between content scripts ↔ background service worker.
 */

export type SiteId = 'chatgpt' | 'claude-ai' | 'gemini' | 'perplexity' | 'genspark';

export interface CapturedPrompt {
  source: SiteId;
  browser_session_id: string;
  prompt_text: string;
  captured_at: string;
}

export interface IngestResult {
  ok: boolean;
  /** Present when the local agent accepted the prompt and returned a score. */
  tier?: 'good' | 'ok' | 'weak' | 'bad';
  score?: number;
  hits?: Array<{ rule_id: string; severity: number; message: string }>;
  /** Present only when the local agent is unreachable and we queued the row. */
  queued?: true;
}

export type Message = { kind: 'prompt'; payload: CapturedPrompt };
