import { type PromptHook, activate, isEnterSubmit } from './base-hook.js';

const perplexity: PromptHook = {
  siteId: 'perplexity',

  findInputRoot() {
    return (
      (document.querySelector('textarea[placeholder]') as HTMLElement | null) ??
      (document.querySelector('textarea') as HTMLElement | null)
    );
  },

  readPrompt(root) {
    return (root as HTMLTextAreaElement).value ?? (root as HTMLElement).innerText;
  },

  onSubmit(root, cb) {
    const onKey = (ev: KeyboardEvent) => {
      if (!isEnterSubmit(ev)) return;
      const text = perplexity.readPrompt(root);
      if (text) cb(text);
    };
    root.addEventListener('keydown', onKey, true);

    const onClick = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      const btn = target?.closest('button') as HTMLElement | null;
      if (!btn) return;
      const aria = btn.getAttribute('aria-label') ?? '';
      const testId = btn.getAttribute('data-testid') ?? '';
      if (!/submit|send/i.test(aria) && !/submit|send/i.test(testId)) return;
      const text = perplexity.readPrompt(root);
      if (text) cb(text);
    };
    document.addEventListener('click', onClick, true);

    return () => {
      root.removeEventListener('keydown', onKey, true);
      document.removeEventListener('click', onClick, true);
    };
  },

  getSessionId() {
    const m = location.pathname.match(/\/search\/([a-zA-Z0-9-]+)/);
    if (m) return m[1]!;
    return `tab-${Math.floor(performance.timeOrigin)}`;
  },
};

if (typeof window !== 'undefined') {
  activate(perplexity);
}

export default perplexity;
