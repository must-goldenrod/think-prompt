import { type PromptHook, activate, isEnterSubmit } from './base-hook.js';

const claudeAi: PromptHook = {
  siteId: 'claude-ai',

  findInputRoot() {
    return (
      (document.querySelector('div[contenteditable="true"].ProseMirror') as HTMLElement | null) ??
      (document.querySelector('div[contenteditable="true"]') as HTMLElement | null)
    );
  },

  readPrompt(root) {
    return (root as HTMLElement).innerText;
  },

  onSubmit(root, cb) {
    const onKey = (ev: KeyboardEvent) => {
      if (!isEnterSubmit(ev)) return;
      const text = claudeAi.readPrompt(root);
      if (text) cb(text);
    };
    root.addEventListener('keydown', onKey, true);

    const onClick = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      const btn = target?.closest('button') as HTMLElement | null;
      if (!btn) return;
      const aria = btn.getAttribute('aria-label') ?? '';
      if (!/send/i.test(aria)) return;
      const text = claudeAi.readPrompt(root);
      if (text) cb(text);
    };
    document.addEventListener('click', onClick, true);

    return () => {
      root.removeEventListener('keydown', onKey, true);
      document.removeEventListener('click', onClick, true);
    };
  },

  getSessionId() {
    const m = location.pathname.match(/\/chat\/([a-zA-Z0-9-]+)/);
    if (m) return m[1]!;
    return `tab-${Math.floor(performance.timeOrigin)}`;
  },
};

if (typeof window !== 'undefined') {
  activate(claudeAi);
}

export default claudeAi;
