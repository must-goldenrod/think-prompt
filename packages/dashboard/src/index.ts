import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { createLogger, getPaths, loadConfig } from '@think-prompt/core';
import { buildDashboardServer } from './server.js';

const paths = getPaths();
const config = loadConfig();
const logger = createLogger('dashboard.bootstrap', { file: paths.workerLog, stdout: true });

async function findFreePort(startPort: number, attempts = 10): Promise<number> {
  const net = await import('node:net');
  for (let i = 0; i < attempts; i++) {
    const port = startPort + i;
    const free = await new Promise<boolean>((resolve) => {
      const s = net.createServer();
      s.once('error', () => {
        s.close();
        resolve(false);
      });
      s.once('listening', () => {
        s.close(() => resolve(true));
      });
      s.listen(port, '127.0.0.1');
    });
    if (free) return port;
  }
  throw new Error(`No free port starting from ${startPort}`);
}

async function main() {
  const app = buildDashboardServer();
  const port = await findFreePort(config.dashboard.port);
  await app.listen({ host: '127.0.0.1', port });
  const pidFile = `${paths.root}/dashboard.pid`;
  writeFileSync(pidFile, String(process.pid), 'utf8');
  logger.info({ port, pid: process.pid }, 'dashboard listening');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    await app.close();
    if (existsSync(pidFile)) {
      try {
        unlinkSync(pidFile);
      } catch {
        // ignore
      }
    }
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'dashboard failed to start');
  process.exit(1);
});
