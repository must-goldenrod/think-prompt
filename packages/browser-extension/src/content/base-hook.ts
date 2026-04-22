import {
  type CapturedPrompt,
  MAX_PROMPT_CHARS,
  type Message,
  type SiteId,
} from '../shared/types.js';

export interface PromptHook {
  readonly siteId: SiteId;
  /** Return the live input element, or null while it hasn't mounted. */
  findInputRoot(): HTMLElement | null;
  /** Extract the current typed prompt from the input DOM. */
  readPrompt(root: HTMLElement): string;
  /** Install a listener that calls `cb` with the final prompt at submit time. Returns a disposer. */
  onSubmit(root: HTMLElement, cb: (prompt: string) => void): () => void;
  /** Browser-side session id — URL slug or similar. */
  getSessionId(): string;
}

/**
 * Common glue. Exported so site adapters can call it once they've constructed
 * a PromptHook implementation.
 *
 * Lifecycle: the adapter watches the top-level DOM for its input root. On
 * SPA navigation (pushState / popstate, common on chatgpt.com, claude.ai,
 * gemini.google.com) we tear down and reinstall so we don't accumulate
 * stale listeners bound to unmounted DOM.
 */
export function activate(hook: PromptHook): void {
  announceLoaded(hook.siteId);

  let currentDispose: (() => void) | null = null;
  let currentRoot: HTMLElement | null = null;
  let obs: MutationObserver | null = null;
  let lastHref = location.href;

  const tryInstall = () => {
    const root = hook.findInputRoot();
    if (!root || root === currentRoot) return;
    // DOM changed — rebind.
    currentDispose?.();
    currentRoot = root;
    currentDispose = install(hook, root);
  };

  const scheduleRebind = () => {
    currentDispose?.();
    currentDispose = null;
    currentRoot = null;
    tryInstall();
  };

  const handleNav = () => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    // New conversation slug — adapters derive browser_session_id from URL,
    // so the listeners bound on the old root are now stale.
    scheduleRebind();
  };

  // 1) First attempt: input may already be in the DOM (document_idle).
  tryInstall();

  // 2) Observe DOM + location for hydration and SPA routing.
  obs = new MutationObserver(() => {
    handleNav();
    if (!currentRoot) tryInstall();
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('popstate', handleNav);
  // Monkey-patch pushState / replaceState to emit a synthetic event we can
  // observe. Pages use these for in-app navigation without popstate.
  wrapHistoryApi();
  window.addEventListener('tp:locationchange', handleNav);

  // 3) Tear down completely when the page unloads.
  window.addEventListener(
    'beforeunload',
    () => {
      currentDispose?.();
      obs?.disconnect();
    },
    { once: true }
  );
}

function wrapHistoryApi(): void {
  const w = window as unknown as { __tpHistoryWrapped?: boolean };
  if (w.__tpHistoryWrapped) return;
  w.__tpHistoryWrapped = true;
  const fire = () => window.dispatchEvent(new Event('tp:locationchange'));
  const origPush = history.pushState;
  const origReplace = history.replaceState;
  history.pushState = function (...args: Parameters<typeof origPush>) {
    const r = origPush.apply(this, args);
    fire();
    return r;
  };
  history.replaceState = function (...args: Parameters<typeof origReplace>) {
    const r = origReplace.apply(this, args);
    fire();
    return r;
  };
}

function announceLoaded(source: SiteId): void {
  if (!extensionAlive()) return;
  try {
    const msg: Message = { kind: 'content-loaded', source };
    chrome.runtime.sendMessage(msg, () => {
      // swallow lastError — the page may outlive the service worker
      void chrome.runtime.lastError;
    });
  } catch {
    // no-op — runtime may be restarting or the context was invalidated
  }
}

/**
 * After an extension reload, existing content scripts keep running but
 * `chrome.runtime.id` becomes undefined. Further sendMessage calls throw
 * "Extension context invalidated." We guard every call site with this.
 */
function extensionAlive(): boolean {
  try {
    return typeof chrome !== 'undefined' && !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

/** Password fields and similar sensitive inputs must never be captured. */
function isSensitiveRoot(root: HTMLElement): boolean {
  if (root instanceof HTMLInputElement) {
    if (root.type === 'password') return true;
    const autoc = root.getAttribute('autocomplete') ?? '';
    if (/password|cc-|one-time-code/i.test(autoc)) return true;
  }
  const autoc = root.getAttribute('autocomplete') ?? '';
  if (/password|cc-|one-time-code/i.test(autoc)) return true;
  return false;
}

function install(hook: PromptHook, root: HTMLElement): () => void {
  if (isSensitiveRoot(root)) {
    // Refuse to bind at all — the adapter picked up a field we should not read.
    return () => {};
  }
  const dispose = hook.onSubmit(root, (prompt) => {
    if (!prompt || prompt.trim().length === 0) return;
    const truncated = prompt.length > MAX_PROMPT_CHARS;
    const body = truncated ? prompt.slice(0, MAX_PROMPT_CHARS) : prompt;
    const payload: CapturedPrompt = {
      source: hook.siteId,
      browser_session_id: hook.getSessionId(),
      prompt_text: body,
      captured_at: new Date().toISOString(),
      ...(truncated ? { truncated: true } : {}),
    };
    if (!extensionAlive()) return;
    try {
      chrome.runtime.sendMessage({ kind: 'prompt', payload } satisfies Message, () => {
        void chrome.runtime.lastError;
      });
    } catch {
      // background may be restarting — lose the ping rather than crash the page.
    }
  });
  return dispose;
}

/**
 * Helper: "Enter to submit" when Shift is not held. Used by most chat UIs.
 */
export function isEnterSubmit(ev: KeyboardEvent): boolean {
  return ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing;
}
