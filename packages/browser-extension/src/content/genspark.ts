import { type PromptHook, activate, isEnterSubmit } from './base-hook.js';

const genspark: PromptHook = {
  siteId: 'genspark',

  findInputRoot() {
    return (
      (document.querySelector('textarea') as HTMLElement | null) ??
      (document.querySelector('div[contenteditable="true"]') as HTMLElement | null)
    );
  },

  readPrompt(root) {
    if (root instanceof HTMLTextAreaElement) return root.value;
    const el = root as HTMLElement;
    return el.innerText || el.textContent || '';
  },

  onSubmit(root, cb) {
    const onKey = (ev: KeyboardEvent) => {
      if (!isEnterSubmit(ev)) return;
      const text = genspark.readPrompt(root);
      if (text) cb(text);
    };
    root.addEventListener('keydown', onKey, true);

    const onClick = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      const btn = target?.closest('button') as HTMLElement | null;
      if (!btn) return;
      const text = genspark.readPrompt(root);
      if (text && /search|submit|send|ask/i.test(btn.textContent ?? '')) {
        cb(text);
      }
    };
    document.addEventListener('click', onClick, true);

    return () => {
      root.removeEventListener('keydown', onKey, true);
      document.removeEventListener('click', onClick, true);
    };
  },

  getSessionId() {
    const m = location.pathname.match(/\/(search|chat)\/([a-zA-Z0-9-]+)/);
    if (m) return m[2]!;
    return `tab-${Math.floor(performance.timeOrigin)}`;
  },
};

if (typeof window !== 'undefined') {
  activate(genspark);
}

export default genspark;
