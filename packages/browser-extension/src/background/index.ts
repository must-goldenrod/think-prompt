/**
 * Service worker entry.
 *
 * Receives captured prompts from content scripts, masks PII on-device,
 * queues to IndexedDB, and syncs to the local Think-Prompt agent.
 */
import { maskPii } from '../shared/pii.js';
import type { CapturedPrompt, IngestResult, Message } from '../shared/types.js';
import { agentReachable, sendIngest } from './agent-client.js';
import { enqueue, markError, markSynced, pendingRows, stats } from './queue.js';

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const arr = Array.from(new Uint8Array(hash));
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function handlePrompt(p: CapturedPrompt): Promise<IngestResult> {
  const { masked, hits } = maskPii(p.prompt_text);
  const hash = await sha256Hex(p.prompt_text);
  const id = `${hash.slice(0, 8)}-${Date.now()}`;
  const row = {
    id,
    source: p.source,
    browser_session_id: p.browser_session_id,
    prompt_text: p.prompt_text,
    pii_masked: masked,
    pii_hits: hits,
    created_at: p.captured_at,
    synced: false,
    attempts: 0,
  };
  await enqueue(row);

  if (!(await agentReachable())) {
    return { ok: true, queued: true };
  }
  try {
    const result = await sendIngest(row);
    await markSynced(id);
    return result;
  } catch (err) {
    await markError(id, (err as Error).message);
    return { ok: true, queued: true };
  }
}

async function drainPending(): Promise<number> {
  if (!(await agentReachable())) return 0;
  const rows = await pendingRows();
  let ok = 0;
  for (const row of rows) {
    try {
      await sendIngest(row);
      await markSynced(row.id);
      ok++;
    } catch (err) {
      await markError(row.id, (err as Error).message);
    }
  }
  return ok;
}

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  if (msg.kind === 'prompt') {
    handlePrompt(msg.payload)
      .then((r) => sendResponse(r))
      .catch((err) => sendResponse({ ok: false, error: (err as Error).message }));
    return true; // async response
  }
  return false;
});

chrome.runtime.onMessage.addListener((msg: any, _sender, sendResponse) => {
  if (msg?.kind === 'stats') {
    stats().then(sendResponse);
    return true;
  }
  if (msg?.kind === 'sync-now') {
    drainPending().then((n) => sendResponse({ synced: n }));
    return true;
  }
  return false;
});

// Periodic drain — best-effort; SW will be killed when idle.
setInterval(() => {
  drainPending().catch(() => {});
}, 60 * 1000);
