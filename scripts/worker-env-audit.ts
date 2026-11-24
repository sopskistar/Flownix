import { parseEnv } from "node:util";
import { readFileSync, existsSync } from "node:fs";
import { envSchema } from "../packages/core/src/config";
const required = [
  "DATABASE_URL",
  "DATABASE_URL_WORKER",
  "BSC_RPC_URL",
  "ETH_RPC_URL",
  "BASE_RPC_URL",
  "ARBITRUM_RPC_URL",
  "SOLANA_RPC_URL",
  "ALCHEMY_MONTHLY_UNTRACKED_CU",
];
const keys = [
  ...required,
  "SONIC_RPC_URL",
  "ROBINHOOD_RPC_URL",
  "WORKER_EXECUTION_MODE",
  "WORKER_DUTY_INTERVAL_SECONDS",
  "WORKER_DUTY_ACTIVE_SECONDS",
  "WORKER_DUTY_NEON_MAX_CU",
  "WORKER_DUTY_MONTHLY_CU_LIMIT",
  "MARKET_HISTORY_BACKFILL_ENABLED",
  "ALPHA_REQUESTS_PER_MINUTE",
  "DATABASE_STORAGE_LIMIT_MB",
  "ALCHEMY_MONTHLY_CU_LIMIT",
  "ALCHEMY_DAILY_CU_LIMIT",
  "ALCHEMY_ENRICHMENT_DAILY_CU_LIMIT",
  "ALCHEMY_HISTORICAL_DAILY_CU_LIMIT",
  "BASELINE_SCAN_INTERVAL_SECONDS",
  "SOLANA_BASELINE_INTERVAL_SECONDS",
  "SCAN_BLOCKS",
  "MARKET_TOKEN_LIMIT",
  "TELEGRAM_ENABLED",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "TELEGRAM_WATCHLIST_ONLY",
  "PAID_ENRICHMENT_ENABLED",
  "PAID_DAILY_BUDGET_USD",
  "GITHUB_CLIENT_SECRET",
  "NEXTAUTH_SECRET",
];
const files = [
  ".env",
  ".env.local",
  ".env.worker.local",
  ".env.worker.runtime",
  ".env.worker.budget",
];
const results = files.map((file) => {
  if (!existsSync(file)) return { file, status: "Missing" };
  const input = parseEnv(readFileSync(file, "utf8"));
  return {
    file,
    variables: Object.fromEntries(
      keys.map((key) => {
        if (!Object.hasOwn(envSchema.shape, key))
          return [key, "Not required for the worker"];
        const value = input[key];
        if (!value)
          return [key, required.includes(key) ? "Missing" : "Optional"];
        let valid =
          envSchema.shape[key as keyof typeof envSchema.shape].safeParse(
            value,
          ).success;
        if (key.startsWith("DATABASE_URL")) {
          try {
            const u = new URL(value);
            valid =
              /^postgres(ql)?:$/.test(u.protocol) &&
              !!u.username &&
              !!u.password &&
              !!u.pathname &&
              (["localhost", "127.0.0.1"].includes(u.hostname) ||
                u.searchParams.get("sslmode") === "require");
          } catch {
            valid = false;
          }
        }
        if (key.endsWith("_RPC_URL")) {
          try {
            valid = new URL(value).protocol === "https:";
          } catch {
            valid = false;
          }
        }
        return [key, valid ? "Present and valid" : "Present but invalid"];
      }),
    ),
    productionTargetPairValid: (() => {
      try {
        const p = new URL(input.DATABASE_URL ?? ""),
          d = new URL(input.DATABASE_URL_WORKER ?? "");
        return (
          d.hostname.endsWith(".neon.tech") &&
          !d.hostname.includes("-pooler") &&
          p.hostname.replace("-pooler", "") === d.hostname &&
          p.pathname === d.pathname &&
          p.username === d.username
        );
      } catch {
        return false;
      }
    })(),
  };
});
console.log(
  JSON.stringify(
    {
      at: new Date().toISOString(),
      results,
      note: "Validity is syntax/target consistency, not connectivity, provider identity or account-wide usage verification. No values printed.",
    },
    null,
    2,
  ),
);
