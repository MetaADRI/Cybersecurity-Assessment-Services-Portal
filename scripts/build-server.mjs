import { build } from 'esbuild';

await build({
  entryPoints: ['server/src/main.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  packages: 'external',
  outfile: 'dist-server/main.js',
  logLevel: 'warning',
});
