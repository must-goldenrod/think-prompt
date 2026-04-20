/**
 * `think-prompt autostart` — register OS-level auto-start so the 3 daemons
 * (agent, worker, dashboard) survive reboots and respawn on crash without
 * manual `think-prompt install` / `start`.
 *
 *   macOS  → ~/Library/LaunchAgents/com.thinkprompt.<role>.plist (launchd)
 *   Linux  → ~/.config/systemd/user/think-prompt-<role>.service (systemd --user)
 *
 * Sub-commands:
 *   enable   write unit files + load
 *   disable  unload + remove unit files (preserves data + hooks)
 *   status   show installed/active per role
 *
 * Design note: this is OPT-IN. `think-prompt install` does NOT auto-enable
 * autostart — explicit consent (D-028 fail-open spirit + D-004 local-first).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import pc from 'picocolors';
import { type Role, resolveEntry } from '../daemon.js';

const ROLES: Role[] = ['agent', 'worker', 'dashboard'];

type Platform = 'darwin' | 'linux';

function detectPlatform(): Platform {
  if (process.platform === 'darwin') return 'darwin';
  if (process.platform === 'linux') return 'linux';
  throw new Error(`autostart: unsupported platform "${process.platform}" (macOS/Linux only)`);
}

function unitDir(p: Platform): string {
  return p === 'darwin' ? `${homedir()}/Library/LaunchAgents` : `${homedir()}/.config/systemd/user`;
}

function unitFileName(p: Platform, role: Role): string {
  return p === 'darwin' ? `com.thinkprompt.${role}.plist` : `think-prompt-${role}.service`;
}

function unitPath(p: Platform, role: Role): string {
  return `${unitDir(p)}/${unitFileName(p, role)}`;
}

function uid(): string {
  return execFileSync('id', ['-u']).toString().trim();
}

function tryRun(cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch {
    return '';
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 * POLICY ZONE — fill in the auto-start behaviour you want shipped.
 *
 * The two functions below are the ONLY meaningful design decision in this
 * file. Everything else (path resolution, file writing, launchctl/systemctl
 * shell-out) is mechanical.
 *
 * Decisions to encode:
 *   1. RunAtLoad / WantedBy=default.target  — start on login?
 *   2. KeepAlive policy:
 *        a) always-on:    `<key>KeepAlive</key><true/>`            (Restart=always)
 *        b) crash-only:   `<key>KeepAlive</key><dict>
 *                            <key>SuccessfulExit</key><false/>
 *                          </dict>`                                 (Restart=on-failure)
 *        c) one-shot:     omit KeepAlive entirely                   (Restart=no)
 *   3. ThrottleInterval / RestartSec — back-off seconds (avoid restart storms)
 *   4. StandardOutPath / StandardErrorPath — combine vs split logs
 *   5. Working directory + minimal EnvironmentVariables (PATH, NODE_ENV)
 *
 * Pick whatever matches the project's UX. The reference plist used by
 * Part A (one-off setup on the maintainer's machine) lives at
 *   ~/Library/LaunchAgents/com.thinkprompt.<role>.plist
 * if you want a starting point.
 * ────────────────────────────────────────────────────────────────────────── */

function buildLaunchdPlist(role: Role, nodePath: string, entry: string, root: string): string {
  // TODO(autostart): return the plist XML. Should be 25-40 lines.
  // Use the parameters: role (Label suffix), nodePath, entry, root (logs dir).
  void role;
  void nodePath;
  void entry;
  void root;
  throw new Error(
    'autostart: buildLaunchdPlist not yet implemented — see POLICY ZONE comment in autostart.ts'
  );
}

function buildSystemdUnit(role: Role, nodePath: string, entry: string, root: string): string {
  // TODO(autostart): return the [Unit]/[Service]/[Install] body.
  // Mirror buildLaunchdPlist policy choices in systemd syntax.
  void role;
  void nodePath;
  void entry;
  void root;
  throw new Error(
    'autostart: buildSystemdUnit not yet implemented — see POLICY ZONE comment in autostart.ts'
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function buildContent(p: Platform, role: Role): string {
  const nodePath = process.execPath;
  const entry = resolveEntry(role);
  const root = `${homedir()}/.think-prompt`;
  return p === 'darwin'
    ? buildLaunchdPlist(role, nodePath, entry, root)
    : buildSystemdUnit(role, nodePath, entry, root);
}

function loadUnit(p: Platform, file: string, role: Role): void {
  if (p === 'darwin') {
    execFileSync('launchctl', ['bootstrap', `gui/${uid()}`, file], { stdio: 'inherit' });
  } else {
    execFileSync('systemctl', ['--user', 'enable', '--now', `think-prompt-${role}.service`], {
      stdio: 'inherit',
    });
  }
}

function unloadUnit(p: Platform, file: string, role: Role): void {
  if (p === 'darwin') {
    try {
      execFileSync('launchctl', ['bootout', `gui/${uid()}`, file], { stdio: 'inherit' });
    } catch {
      // already unloaded
    }
  } else {
    try {
      execFileSync('systemctl', ['--user', 'disable', '--now', `think-prompt-${role}.service`], {
        stdio: 'inherit',
      });
    } catch {
      // already disabled
    }
  }
}

function isActive(p: Platform, role: Role): boolean {
  if (p === 'darwin') {
    const out = tryRun('launchctl', ['list']);
    const line = out.split('\n').find((l) => l.includes(`com.thinkprompt.${role}`));
    if (!line) return false;
    const pid = line.split(/\s+/)[0];
    return /^\d+$/.test(pid ?? '') && pid !== '0';
  }
  const out = tryRun('systemctl', ['--user', 'is-active', `think-prompt-${role}.service`]).trim();
  return out === 'active';
}

export function autostartEnableCmd(): void {
  const p = detectPlatform();
  mkdirSync(unitDir(p), { recursive: true });
  console.log(pc.bold(`autostart enable (${p})`));
  for (const role of ROLES) {
    const file = unitPath(p, role);
    writeFileSync(file, buildContent(p, role), 'utf8');
    loadUnit(p, file, role);
    console.log(`${pc.green('✓')} ${role.padEnd(10)} ${file}`);
  }
  console.log(pc.dim('\nVerify: think-prompt autostart status'));
}

export function autostartDisableCmd(): void {
  const p = detectPlatform();
  console.log(pc.bold(`autostart disable (${p})`));
  for (const role of ROLES) {
    const file = unitPath(p, role);
    if (!existsSync(file)) {
      console.log(`${pc.dim('—')} ${role.padEnd(10)} not installed`);
      continue;
    }
    unloadUnit(p, file, role);
    unlinkSync(file);
    console.log(`${pc.green('✓')} ${role.padEnd(10)} unloaded & removed`);
  }
}

export function autostartStatusCmd(): void {
  const p = detectPlatform();
  console.log(pc.bold(`autostart status (${p})`));
  for (const role of ROLES) {
    const file = unitPath(p, role);
    const installed = existsSync(file);
    const active = installed && isActive(p, role);
    const mark = !installed ? pc.dim('—') : active ? pc.green('✓') : pc.yellow('•');
    const state = !installed
      ? 'not installed'
      : active
        ? 'installed / running'
        : 'installed / inactive';
    console.log(`${mark} ${role.padEnd(10)} ${state}`);
    if (installed) console.log(`  ${pc.dim(file)}`);
  }
}
