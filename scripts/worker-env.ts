import { parseEnv } from "node:util";
import { readFileSync, writeFileSync } from "node:fs";
import { envSchema } from "../packages/core/src/config";

// Explicit worker schema only: OAuth, Vercel, GitHub, signing and unrelated API
// secrets in the source file cannot be copied into the collector environment.
try {
  const input = parseEnv(readFileSync(".env.worker.local", "utf8"));
  envSchema.parse(input);
  const excluded = new Set([
    "ACCESS_MODE",
    "PROVIDER_PROCESS_REQUEST_BUDGET",
    "WORKER_RUN_SECONDS",
  ]);
  const entries = Object.entries(input).filter(
    (entry): entry is [string, string] =>
      typeof entry[1] === "string" &&
      Object.hasOwn(envSchema.shape, entry[0]) &&
      !excluded.has(entry[0]),
  );
  for (const [, value] of entries)
    if (/[\r\n\0]/.test(value)) throw Error("INVALID_ENV_VALUE");
  const environment = Object.fromEntries(entries);
  environment.PROVIDER_DNS_SERVERS = process.argv.includes("--keep-local-dns")
    ? (input.PROVIDER_DNS_SERVERS ?? "")
    : "";
  environment.TELEGRAM_ENABLED = "false";
  environment.PAID_ENRICHMENT_ENABLED = "false";
  environment.PAID_DAILY_BUDGET_USD = "0";
  const path = ".env.worker.runtime";
  writeFileSync(
    path,
    Object.entries(environment)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join("\n") + "\n",
    { mode: 0o600, flag: "wx" },
  );
  console.log(
    JSON.stringify({
      ok: true,
      path,
      keys: Object.keys(environment).sort(),
      note: "Secret values were not printed. File is Git-ignored; existing files are never overwritten.",
    }),
  );
} catch {
  console.error(
    "WORKER_ENV_EXPORT_FAILED: validate source values and ensure .env.worker.runtime does not already exist.",
  );
  process.exitCode = 1;
}
