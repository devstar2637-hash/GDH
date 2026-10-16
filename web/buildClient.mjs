import { mkdir, copyFile } from 'node:fs/promises';
import { build } from 'esbuild';
// Preserve the existing workbench assets. The six-screen client is a separate entry point.
await mkdir('dist/web/public', { recursive: true });
for (const file of ['index.html','styles.css','app.js']) await copyFile(`web/public/${file}`, `dist/web/public/${file}`);
await mkdir('dist/web/client', { recursive: true });
await build({
  entryPoints: ['web/client/app.ts'],
  outfile: 'dist/web/client/app.js',
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: ['es2022'],
  sourcemap: false,
});
for (const file of ['index.html','styles.css']) await copyFile(`web/client/${file}`, `dist/web/client/${file}`);
console.log('Workbench assets preserved; six-screen browser bundle and CSP-compatible stylesheet built.');
