// web/buildClient.mjs — Lane A3 client bundler using esbuild.
// Bundles web/client/app.ts -> dist/web/client/app.js and copies web/client/index.html -> dist/web/client/index.html.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
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

const version = createHash("sha256")
  .update(readFileSync(resolve(outDir, "app.js")))
  .update(readFileSync(resolve(outDir, "styles.css")))
  .digest("hex").slice(0, 12);
const html = readFileSync(resolve(repoRoot, "web/client/index.html"), "utf8")
  .replace('src="/app.js"', 'src="/app.js?v=' + version + '"')
  .replace('href="/styles.css"', 'href="/styles.css?v=' + version + '"')
  .replace("</head>", '<meta name="ui-build" content="' + version + '" /></head>');
writeFileSync(resolve(outDir, "index.html"), html);
writeFileSync(resolve(outDir, "version.json"), JSON.stringify({ uiBuild: version }));

console.log("[buildClient] Built dist/web/client/app.js and dist/web/client/index.html");
