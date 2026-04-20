/**
 * Template for Claude Code settings.json hook block.
 * Installed/removed by `pro-prompt install` / `uninstall`.
 */

export interface HookBlock {
  matcher: string;
  hooks: Array<{ type: 'http' | 'command'; url?: string; command?: string; timeout: number }>;
}

export function buildHookBlocks(agentPort: number): Record<string, HookBlock[]> {
  const url = (path: string) => `http://127.0.0.1:${agentPort}/v1/hook/${path}`;
  const mk = (path: string, timeout: number): HookBlock => ({
    matcher: '',
    hooks: [{ type: 'http', url: url(path), timeout }],
  });
  return {
    UserPromptSubmit: [mk('user-prompt-submit', 3)],
    SessionStart: [mk('session-start', 2)],
    SubagentStart: [mk('subagent-start', 2)],
    SubagentStop: [mk('subagent-stop', 2)],
    PostToolUse: [mk('post-tool-use', 3)],
    Stop: [mk('stop', 5)],
  };
}

export const HOOK_KEYS = [
  'UserPromptSubmit',
  'SessionStart',
  'SubagentStart',
  'SubagentStop',
  'PostToolUse',
  'Stop',
] as const;

/**
 * A hook block in the claude settings.json is "ours" if any of its hooks
 * points at the pro-prompt agent URL.
 */
export function isOurHookBlock(block: any): boolean {
  if (!block || !Array.isArray(block.hooks)) return false;
  return block.hooks.some(
    (h: any) =>
      typeof h?.url === 'string' && h.url.includes('/v1/hook/') && h.url.includes('127.0.0.1')
  );
}
