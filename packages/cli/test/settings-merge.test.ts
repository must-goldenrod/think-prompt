import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  hooksPresent,
  mergeHooksIntoSettings,
  removeHooksFromSettings,
} from '../src/settings-merge.js';

let tmp: string;
let settingsPath: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'pp-cli-'));
  settingsPath = join(tmp, 'settings.json');
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('settings merge', () => {
  it('creates fresh settings when none exist', () => {
    const r = mergeHooksIntoSettings(settingsPath, 47823);
    expect(r.changed).toBe(true);
    expect(hooksPresent(settingsPath)).toBe(true);
    const obj = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(obj.hooks.UserPromptSubmit[0].hooks[0].url).toContain('127.0.0.1:47823');
  });

  it('preserves unrelated user hooks', () => {
    writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: 'Bash',
              hooks: [{ type: 'command', command: 'echo before', timeout: 10 }],
            },
          ],
        },
      })
    );
    mergeHooksIntoSettings(settingsPath, 47823);
    const obj = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(obj.hooks.PreToolUse[0].hooks[0].command).toBe('echo before');
    expect(obj.hooks.UserPromptSubmit).toBeDefined();
  });

  it('does not duplicate our block on reinstall', () => {
    mergeHooksIntoSettings(settingsPath, 47823);
    mergeHooksIntoSettings(settingsPath, 47823);
    const obj = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(obj.hooks.UserPromptSubmit.length).toBe(1);
  });

  it('removes only our blocks on uninstall', () => {
    writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          UserPromptSubmit: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'echo user', timeout: 5 }],
            },
          ],
        },
      })
    );
    mergeHooksIntoSettings(settingsPath, 47823);
    // user block + our block exist
    let obj = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(obj.hooks.UserPromptSubmit.length).toBe(2);
    removeHooksFromSettings(settingsPath);
    obj = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(obj.hooks.UserPromptSubmit.length).toBe(1);
    expect(obj.hooks.UserPromptSubmit[0].hooks[0].command).toBe('echo user');
  });

  it('changes nothing on re-merge of already-correct settings', () => {
    mergeHooksIntoSettings(settingsPath, 47823);
    const first = readFileSync(settingsPath, 'utf8');
    const r = mergeHooksIntoSettings(settingsPath, 47823);
    expect(r.changed).toBe(false);
    const second = readFileSync(settingsPath, 'utf8');
    expect(first).toBe(second);
  });
});
