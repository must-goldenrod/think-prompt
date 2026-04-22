/**
 * Service worker entry.
 *
 * Receives captured prompts from content scripts, masks PII on-device,
 * queues to IndexedDB, and syncs to the local Think-Prompt agent.
 *
 * Additional responsibilities (v0.3.x):
 *  - Honor the per-site on/off toggle stored in chrome.storage.local
 *    (key: SITE_TOGGLE_STORAGE_KEY). Disabled sites bypass capture entirely.
 *  - Surface the latest quality tier/score as an action-badge so the user
 *    sees feedback without opening the popup.
 *  - Use chrome.alarms (not setInterval) to drain the queue — MV3 service
 *    workers die after ~30s idle and setInterval stops firing.
 *  - Reject messages from other extensions and from malformed payloads.
 *  - Open the Options page on first install (onboarding).
 */
import { maskPii } from '../shared/pii.js';
import { type CapturedPrompt, type IngestResult, isValidMessage } from '../shared/types.js';
import { agentReachable, sendIngest } from './agent-client.js';
import {
  clearAll,
  enqueue,
  markError,
  markSynced,
  pendingRows,
  stats,
  unpoisonAll,
} from './queue.js';
import { installToggleSubscription, isSiteEnabled } from './site-toggle.js';

const DRAIN_ALARM = 'think-prompt-drain';

installToggleSubscription();

// --- Badge feedback -----------------------------------------------------

type Tier = 'good' | 'ok' | 'weak' | 'bad';
const TIER_COLORS: Record<Tier, string> = {
  good: '#22c55e',
  ok: '#3b82f6',
  weak: '#f59e0b',
  bad: '#ef4444',
};

async function setBadge(tabId: number | undefined, text: string, color: string): Promise<void> {
  if (tabId == null) return;
  try {
    await chrome.action.setBadgeText({ tabId, text });
    await chrome.action.setBadgeBackgroundColor({ tabId, color });
  } catch {
    // action API not available in some MV3 contexts (e.g. under test).
  }
}

async function markTabWatching(tabId: number | undefined): Promise<void> {
  // Small green dot confirms the content script is live on this tab.
  await setBadge(tabId, '●', TIER_COLORS.good);
}

async function showScoreBadge(
  tabId: number | undefined,
  score: number | undefined,
  tier: Tier | undefined
): Promise<void> {
  if (score == null || tier == null) return;
  const text = score >= 100 ? '99+' : String(Math.max(0, Math.round(score)));
  await setBadge(tabId, text, TIER_COLORS[tier]);
}

// --- Pipeline -----------------------------------------------------------

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const arr = Array.from(new Uint8Array(hash));
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function handlePrompt(p: CapturedPrompt, tabId?: number): Promise<IngestResult> {
  if (!(await isSiteEnabled(p.source))) {
    return { ok: true, disabled: true };
  }

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
    await showScoreBadge(tabId, result.score, result.tier);
    return result;
  } catch (err) {
    await markError(id, (err as Error).message);
    return { ok: true, queued: true };
  }
}

// Guards against overlapping drains fired by alarm + popup button + new
// prompt arrivals. Without this the same queue row can be sent twice.
let draining = false;
async function drainPending(): Promise<number> {
  if (draining) return 0;
  draining = true;
  try {
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
  } finally {
    draining = false;
  }
}

// --- Message routing ----------------------------------------------------

chrome.runtime.onMessage.addListener((raw: unknown, sender, sendResponse) => {
  // Hard gate: only messages from this extension's own surfaces are allowed.
  if (sender.id && sender.id !== chrome.runtime.id) return false;
  if (!isValidMessage(raw)) return false;
  const msg = raw;
  const tabId = sender.tab?.id;

  if (msg.kind === 'prompt') {
    handlePrompt(msg.payload, tabId)
      .then((r) => sendResponse(r))
      .catch((err) =>
        sendResponse({ ok: false, error: (err as Error).message } satisfies IngestResult)
      );
    return true;
  }

  if (msg.kind === 'content-loaded') {
    isSiteEnabled(msg.source).then((enabled) => {
      if (enabled) {
        void markTabWatching(tabId);
      } else {
        void setBadge(tabId, '', '#999999');
      }
      sendResponse({ ok: true, enabled });
    });
    return true;
  }

  if (msg.kind === 'stats') {
    stats().then(sendResponse);
    return true;
  }

  if (msg.kind === 'sync-now') {
    drainPending().then((n) => sendResponse({ synced: n }));
    return true;
  }

  if (msg.kind === 'retry-poisoned') {
    unpoisonAll()
      .then((n) => drainPending().then((d) => sendResponse({ reset: n, synced: d })))
      .catch((err) => sendResponse({ ok: false, error: (err as Error).message }));
    return true;
  }

  if (msg.kind === 'clear-all') {
    clearAll()
      .then((n) => sendResponse({ cleared: n }))
      .catch((err) => sendResponse({ ok: false, error: (err as Error).message }));
    return true;
  }

  return false;
});

// --- Periodic drain (MV3-safe) -----------------------------------------

chrome.runtime.onInstalled.addListener((details) => {
  chrome.alarms.create(DRAIN_ALARM, { periodInMinutes: 1 });
  // First-install onboarding: open the Options page so the user sees the
  // privacy statement and per-site toggles before anything is captured.
  if (details.reason === 'install') {
    try {
      chrome.tabs?.create?.({ url: chrome.runtime.getURL('options/index.html') });
    } catch {
      // tabs API unavailable under test
    }
  }
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(DRAIN_ALARM, { periodInMinutes: 1 });
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === DRAIN_ALARM) {
    drainPending().catch(() => {
      // swallowed — SW will be re-armed on the next alarm
    });
  }
});
