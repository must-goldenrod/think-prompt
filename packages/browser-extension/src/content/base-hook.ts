import type { CapturedPrompt, SiteId } from '../shared/types.js';

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
 */
export function activate(hook: PromptHook): void {
  const root = hook.findInputRoot();
  if (root) {
    install(hook, root);
    return;
  }
  // Page may still be hydrating — observe until the input appears.
  const obs = new MutationObserver(() => {
    const r = hook.findInputRoot();
    if (r) {
      obs.disconnect();
      install(hook, r);
    }
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
}

function install(hook: PromptHook, root: HTMLElement): void {
  const dispose = hook.onSubmit(root, (prompt) => {
    if (!prompt || prompt.trim().length === 0) return;
    const payload: CapturedPrompt = {
      source: hook.siteId,
      browser_session_id: hook.getSessionId(),
      prompt_text: prompt,
      captured_at: new Date().toISOString(),
    };
    try {
      chrome.runtime.sendMessage({ kind: 'prompt', payload }, () => {
        // response is IngestResult; we don't need to act on it here
      });
    } catch {
      // background may be restarting — lose the ping rather than crash the page.
    }
  });
  window.addEventListener('beforeunload', () => dispose(), { once: true });
}

/**
 * Helper: "Enter to submit" when Shift is not held. Used by most chat UIs.
 */
export function isEnterSubmit(ev: KeyboardEvent): boolean {
  return ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing;
}
