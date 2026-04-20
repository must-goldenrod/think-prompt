/**
 * Daemon lifecycle helpers: spawn detached agent & worker, read/write pidfile,
 * stop by SIGTERM, basic self-healing.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPaths } from '@pro-prompt/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type Role = 'agent' | 'worker' | 'dashboard';

function readPid(path: string): number | null {
  if (!existsSync(path)) return null;
  try {
    const n = Number.parseInt(readFileSync(path, 'utf8').trim(), 10);
    if (Number.isNaN(n)) return null;
    return n;
  } catch {
    return null;
  }
}

export function isRunning(pid: number | null): boolean {
  if (pid == null) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function resolveEntry(role: Role): string {
  const require = createRequire(import.meta.url);
  // Resolve the package's main entry. Works in a published npm install.
  try {
    return require.resolve(`@pro-prompt/${role}`);
  } catch {
    // Fallback: monorepo relative path (for dev).
    return require.resolve(`../../${role}/dist/index.js`);
  }
}

export interface DaemonStatus {
  role: Role;
  pid: number | null;
  running: boolean;
}

function pidPathFor(role: Role): string {
  const paths = getPaths();
  switch (role) {
    case 'agent':
      return paths.agentPid;
    case 'worker':
      return paths.workerPid;
    case 'dashboard':
      return `${paths.root}/dashboard.pid`;
  }
}

export function status(role: Role): DaemonStatus {
  const pid = readPid(pidPathFor(role));
  return { role, pid, running: isRunning(pid) };
}

export function start(role: Role): DaemonStatus {
  const cur = status(role);
  if (cur.running) return cur;
  // Clean stale pidfile
  const pidPath = pidPathFor(role);
  if (existsSync(pidPath)) {
    try {
      unlinkSync(pidPath);
    } catch {
      // ignore
    }
  }
  const entry = resolveEntry(role);
  const child = spawn(process.execPath, [entry], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref();
  // Give it a moment to write its pidfile
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (existsSync(pidPath)) break;
    // busy wait fallback
  }
  return status(role);
}

export function stop(role: Role): DaemonStatus {
  const cur = status(role);
  if (!cur.running || cur.pid == null) return cur;
  try {
    process.kill(cur.pid, 'SIGTERM');
  } catch {
    // ignore
  }
  // Wait for exit
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (!isRunning(cur.pid)) break;
  }
  const pidPath = pidPathFor(role);
  if (existsSync(pidPath)) {
    try {
      unlinkSync(pidPath);
    } catch {
      // ignore
    }
  }
  return status(role);
}

export function restart(role: Role): DaemonStatus {
  stop(role);
  return start(role);
}
