// web/buildClient.mjs — Lane A3 client bundler using esbuild.
// Bundles web/client/app.ts -> dist/web/client/app.js and copies web/client/index.html -> dist/web/client/index.html.

import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const outDir = resolve(repoRoot, "dist/web/client");

mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: [resolve(repoRoot, "web/client/app.ts")],
  bundle: true,
  outfile: resolve(outDir, "app.js"),
  format: "esm",
  target: ["es2022"],
  platform: "browser",
  sourcemap: false,
  minify: false,
});

copyFileSync(
  resolve(repoRoot, "web/client/index.html"),
  resolve(outDir, "index.html")
);

console.log("[buildClient] Built dist/web/client/app.js and dist/web/client/index.html");
