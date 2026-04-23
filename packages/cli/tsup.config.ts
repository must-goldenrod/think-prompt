import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'daemons/agent': '../agent/src/index.ts',
    'daemons/worker': '../worker/src/index.ts',
    'daemons/dashboard': '../dashboard/src/index.ts',
  },
  format: ['esm'],
  dts: false,
  sourcemap: true,
  clean: true,
  target: 'node20',
  banner: { js: '#!/usr/bin/env node' },
  noExternal: [/^@think-prompt\//],
});
