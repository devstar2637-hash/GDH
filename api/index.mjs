import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createAppHandler } from "../dist/web/server.js";

const version = JSON.parse(readFileSync(resolve(process.cwd(), "dist/web/client/version.json"), "utf8"));

export default createAppHandler({
  persistToDisk: false,
  compactResponses: true,
  engineSha: version.repositorySha?.slice(0, 8),
});
