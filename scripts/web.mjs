import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
// Load root .env without passing --env-file in execArgv (Next propagates execArgv to NODE_OPTIONS).
const envFile = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
const require = createRequire(
  new URL("../apps/web/package.json", import.meta.url),
);
const bin = require.resolve("next/dist/bin/next");
process.argv = [process.execPath, bin, ...process.argv.slice(2)];
await import(pathToFileURL(bin).href);
