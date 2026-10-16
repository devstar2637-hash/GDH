import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const source = process.argv[2];
if (!source) throw new Error("Usage: node web/syncStudioClient.mjs <rehearsal-store checkout>");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const client = resolve(root, "web/client");
const engines = [
  "canvasRenderer.ts", "d3StatsCharts.ts", "rehearsalCore.ts",
  "threeFloorplanStage.ts", "tenKMatrixEngine.ts", "backendSync.ts", "spatialTelemetry.ts",
];
for (const name of ["main.ts", ...engines.map((file) => "engine/" + file)]) {
  readFileSync(resolve(source, "src", name));
}
mkdirSync(resolve(client, "engine"), { recursive: true });
writeFileSync(resolve(client, "app.ts"), readFileSync(resolve(source, "src/main.ts"), "utf8").trimEnd() + "\n");
copyFileSync(resolve(source, "styles.css"), resolve(client, "styles.css"));
for (const name of engines) {
  copyFileSync(resolve(source, "src/engine", name), resolve(client, "engine", name));
}
const html = readFileSync(resolve(source, "index.html"), "utf8")
  .replace('src="/src/main.ts"', 'src="/app.js"')
  .replace("</title>", " · 만 개의 가게 · Ten Thousand Stores</title>")
  .replace("</head>", '<meta name="scenario-mode" content="500 AI design families x 20 variations" /></head>');
writeFileSync(resolve(client, "index.html"), html);
const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: source }).toString().trim();
writeFileSync(resolve(client, "source-version.json"), JSON.stringify({ repository: "rehearsal-store", sourceSha }, null, 2) + "\n");
console.log("Synced rehearsal-store source into GDH web/client.");
