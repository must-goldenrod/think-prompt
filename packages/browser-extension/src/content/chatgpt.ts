import { type PromptHook, activate, isEnterSubmit } from './base-hook.js';

const chatgpt: PromptHook = {
  siteId: 'chatgpt',

  findInputRoot() {
    // Newer UI: contenteditable div with id="prompt-textarea"
    // Older UI: <textarea id="prompt-textarea"> directly
    return (
      (document.querySelector('#prompt-textarea') as HTMLElement | null) ??
      (document.querySelector('textarea[name="prompt"]') as HTMLElement | null)
    );
  },

  readPrompt(root) {
    if (root instanceof HTMLTextAreaElement) return root.value;
    // contenteditable — innerText preserves line breaks roughly
    return (root as HTMLElement).innerText;
  },

  onSubmit(root, cb) {
    // Primary trigger: click on the send button near the input.
    const findSendButton = (): HTMLElement | null =>
      document.querySelector('button[data-testid="send-button"]') ||
      document.querySelector('button[aria-label="Send message"]') ||
      document.querySelector('button[aria-label="Send prompt"]');

    const onKey = (ev: KeyboardEvent) => {
      if (!isEnterSubmit(ev)) return;
      const text = chatgpt.readPrompt(root);
      if (text) cb(text);
    };
    root.addEventListener('keydown', onKey, true);

    // Capture clicks on the send button with delegated listener so we don't
    // bind to a specific node that React may unmount.
    const onClick = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      const btn = target.closest('button') as HTMLElement | null;
      if (!btn) return;
      const current = findSendButton();
      if (!current || !current.isSameNode(btn)) return;
      const text = chatgpt.readPrompt(root);
      if (text) cb(text);
    };
    document.addEventListener('click', onClick, true);

    return () => {
      root.removeEventListener('keydown', onKey, true);
      document.removeEventListener('click', onClick, true);
    };
  },

  getSessionId() {
    const m = location.pathname.match(/\/c\/([a-zA-Z0-9-]+)/);
    if (m) return m[1]!;
    // New chat without slug: use a stable per-tab id
    return `tab-${Math.floor(performance.timeOrigin)}`;
  },
};

if (typeof window !== 'undefined') {
  activate(chatgpt);
}

export default chatgpt;
