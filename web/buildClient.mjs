import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('web/public', { recursive: true });
// Dependency-free browser assets are source files; no keys or server modules enter this build.
await mkdir('dist/web/public', { recursive: true });
for (const file of ['index.html','styles.css','app.js']) await copyFile(`web/public/${file}`, `dist/web/public/${file}`);
console.log('Browser assets copied; server-only modules excluded.');
