import { describe, expect, it } from 'vitest';
import { buildLaunchdPlist, buildSystemdUnit } from '../src/commands/autostart.js';

const NODE_PATH = '/usr/local/bin/node';
const ENTRY = '/Users/alice/.think-prompt-pkg/agent/dist/index.js';
const ROOT = '/Users/alice/.think-prompt';

describe('autostart policy — launchd plist (D-031)', () => {
  const plist = buildLaunchdPlist('agent', NODE_PATH, ENTRY, ROOT);

  it('declares a stable Label using role suffix', () => {
    expect(plist).toContain('<key>Label</key>');
    expect(plist).toContain('<string>com.thinkprompt.agent</string>');
  });

  it('includes node binary + entry path as ProgramArguments', () => {
    expect(plist).toContain(`<string>${NODE_PATH}</string>`);
    expect(plist).toContain(`<string>${ENTRY}</string>`);
  });

  it('starts on login (RunAtLoad true)', () => {
    expect(plist).toMatch(/<key>RunAtLoad<\/key>\s*<true\/>/);
  });

  it('uses CRASH-ONLY respawn policy (KeepAlive.SuccessfulExit=false)', () => {
    // Must NOT be <key>KeepAlive</key><true/> — that would revive explicit stop.
    expect(plist).not.toMatch(/<key>KeepAlive<\/key>\s*<true\/>/);
    expect(plist).toMatch(
      /<key>KeepAlive<\/key>\s*<dict>\s*<key>SuccessfulExit<\/key>\s*<false\/>\s*<\/dict>/
    );
  });

  it('applies 10-second back-off (ThrottleInterval)', () => {
    expect(plist).toMatch(/<key>ThrottleInterval<\/key>\s*<integer>10<\/integer>/);
  });

  it('points stdout + stderr to combined autostart log under root', () => {
    const logFile = `${ROOT}/autostart-agent.log`;
    expect(plist).toContain(`<key>StandardOutPath</key>\n  <string>${logFile}</string>`);
    expect(plist).toContain(`<key>StandardErrorPath</key>\n  <string>${logFile}</string>`);
  });

  it('sets minimal environment (PATH + NODE_ENV=production)', () => {
    expect(plist).toContain('<key>PATH</key>');
    expect(plist).toContain('<string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>');
    expect(plist).toContain('<key>NODE_ENV</key>');
    expect(plist).toContain('<string>production</string>');
  });

  it('xml-escapes path-like strings', () => {
    const quirky = '/tmp/path with "quote" & <bracket>';
    const out = buildLaunchdPlist('worker', NODE_PATH, quirky, ROOT);
    expect(out).toContain('&amp;');
    expect(out).toContain('&quot;');
    expect(out).toContain('&lt;bracket&gt;');
    // Raw unescaped chars in user-supplied segment must be absent.
    expect(out).not.toMatch(/"quote"/);
  });
});

describe('autostart policy — systemd unit (D-031)', () => {
  const unit = buildSystemdUnit('worker', NODE_PATH, ENTRY, ROOT);

  it('has [Unit] / [Service] / [Install] sections', () => {
    expect(unit).toMatch(/^\[Unit\]/m);
    expect(unit).toMatch(/^\[Service\]/m);
    expect(unit).toMatch(/^\[Install\]/m);
  });

  it('labels the service with role in the description', () => {
    expect(unit).toContain('Description=think-prompt worker daemon');
  });

  it('uses ExecStart = node + entry', () => {
    expect(unit).toContain(`ExecStart=${NODE_PATH} ${ENTRY}`);
  });

  it('uses CRASH-ONLY respawn (Restart=on-failure, not always)', () => {
    expect(unit).toContain('Restart=on-failure');
    expect(unit).not.toContain('Restart=always');
  });

  it('applies 10-second back-off (RestartSec)', () => {
    expect(unit).toContain('RestartSec=10');
  });

  it('appends stdout + stderr to combined autostart log under root', () => {
    const logFile = `${ROOT}/autostart-worker.log`;
    expect(unit).toContain(`StandardOutput=append:${logFile}`);
    expect(unit).toContain(`StandardError=append:${logFile}`);
  });

  it('enables on default.target (user login)', () => {
    expect(unit).toContain('WantedBy=default.target');
  });

  it('sets NODE_ENV=production and minimal PATH', () => {
    expect(unit).toContain('Environment=NODE_ENV=production');
    expect(unit).toContain('Environment=PATH=/usr/local/bin:/usr/bin:/bin');
  });
});
