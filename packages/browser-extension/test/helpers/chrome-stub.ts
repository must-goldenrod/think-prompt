/**
 * Shared typed Chrome runtime stub for adapter tests.
 *
 * Replaces ad-hoc `(globalThis as any).chrome = ...` patterns with a typed
 * setup so noExplicitAny linter warnings don't accumulate as we add adapters.
 */
import { type Mock, vi } from 'vitest';

export interface PromptMessage {
  kind: 'prompt';
  payload: {
    source: string;
    prompt_text: string;
    browser_session_id: string;
    [key: string]: unknown;
  };
}

export type AdapterMessage = PromptMessage | { kind: string; [key: string]: unknown };

type SendMessageCallback = (response: unknown) => void;
type SendMessageMock = Mock<(msg: AdapterMessage, cb?: SendMessageCallback) => void>;

interface ChromeStub {
  runtime: {
    sendMessage: SendMessageMock;
  };
}

/**
 * Install a fresh chrome stub on globalThis. Call inside beforeEach.
 * Also stubs `window.performance.timeOrigin` and `window.location.pathname`
 * so adapter session-id derivation works deterministically.
 */
export function setupChromeStub(pathname = '/test'): SendMessageMock {
  const sendMessage: SendMessageMock = vi.fn((_msg: AdapterMessage, cb?: SendMessageCallback) =>
    cb?.({ ok: true })
  );
  const stub: ChromeStub = { runtime: { sendMessage } };
  // Cast through `unknown` keeps the assignment local to this helper without
  // declaring a global `var chrome: any` that would shadow @types/chrome.
  (globalThis as unknown as { chrome: ChromeStub }).chrome = stub;

  Object.defineProperty(window, 'performance', {
    value: { timeOrigin: 1234567890 },
    configurable: true,
  });
  Object.defineProperty(window, 'location', {
    value: { pathname },
    writable: true,
  });
  return sendMessage;
}

/** Find the first 'prompt' kind message in the mock's call log. */
export function findPromptMessage(sendMessage: SendMessageMock): PromptMessage | undefined {
  for (const call of sendMessage.mock.calls) {
    const msg = call[0];
    if (msg && typeof msg === 'object' && (msg as AdapterMessage).kind === 'prompt') {
      return msg as PromptMessage;
    }
  }
  return undefined;
}
