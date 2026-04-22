/**
 * Think-Prompt local agent client. Localhost only.
 *
 * All requests carry `X-Think-Prompt-Ext: 1` so the agent can distinguish
 * calls originating from this extension versus incidental cross-origin
 * traffic from other local processes. See agent/src/server.ts and
 * docs/09-browser-extension-design.md §7.3.
 */

import type { IngestResult } from '../shared/types.js';
import type { QueueRow } from './queue.js';

const AGENT_BASE = 'http://127.0.0.1:47823';
const EXT_HEADER = { 'x-think-prompt-ext': '1' } as const;

export async function agentReachable(timeoutMs = 500): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${AGENT_BASE}/health`, {
      signal: ctrl.signal,
      headers: EXT_HEADER,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

export async function sendIngest(row: QueueRow): Promise<IngestResult> {
  const body = {
    source: row.source,
    browser_session_id: row.browser_session_id,
    prompt_text: row.prompt_text,
    pii_masked: row.pii_masked,
    pii_hits: row.pii_hits,
    created_at: row.created_at,
  };
  const res = await fetch(`${AGENT_BASE}/v1/ingest/web`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...EXT_HEADER },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`agent ${res.status}`);
  }
  return (await res.json()) as IngestResult;
}
