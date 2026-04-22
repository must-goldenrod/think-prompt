/**
 * Per-site on/off toggle backed by chrome.storage.local.
 *
 * The Options page writes `SITE_TOGGLE_STORAGE_KEY` as
 * `Record<SiteId, boolean>`. Missing entries mean "enabled" (opt-out model).
 *
 * Exposed as a standalone module so it is trivially unit-testable without
 * booting the whole service worker.
 */
import { SITE_TOGGLE_STORAGE_KEY, type SiteId } from '../shared/types.js';

type ToggleState = Record<string, boolean>;

let cache: ToggleState | null = null;

async function readStorage(): Promise<ToggleState> {
  try {
    const res = await chrome.storage.local.get(SITE_TOGGLE_STORAGE_KEY);
    const value = res[SITE_TOGGLE_STORAGE_KEY];
    if (value && typeof value === 'object') return value as ToggleState;
    return {};
  } catch {
    return {};
  }
}

export async function isSiteEnabled(source: SiteId): Promise<boolean> {
  if (!cache) cache = await readStorage();
  return cache[source] !== false;
}

export function installToggleSubscription(): void {
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      const delta = changes[SITE_TOGGLE_STORAGE_KEY];
      if (!delta) return;
      cache = (delta.newValue as ToggleState | undefined) ?? {};
    });
  } catch {
    // storage API not available (test harness)
  }
}

/** Test-only: reset the in-process cache. */
export function __resetToggleCacheForTests(): void {
  cache = null;
}
