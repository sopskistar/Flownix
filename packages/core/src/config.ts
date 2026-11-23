import { z } from "zod";
import { dnsServers } from "./network";
const bool = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");
const integer = (v: number, min = 1, max = 100000) =>
  z.coerce.number().int().min(min).max(max).default(v);
export const envSchema = z.object({
  DATABASE_URL: z.string().optional(),
  DATABASE_URL_WORKER: z.string().optional(),
  ACCESS_MODE: z.enum(["local", "oauth"]).default("local"),
  PROVIDER_DNS_SERVERS: z
    .string()
    .default("")
    .refine((value) => {
      try {
        dnsServers(value);
        return true;
      } catch {
        return false;
      }
    }, "Use up to three DNS server IP addresses"),
  BSC_RPC_URL: z.url().default("https://bsc-rpc.publicnode.com"),
  ETH_RPC_URL: z.url().default("https://ethereum-rpc.publicnode.com"),
  BASE_RPC_URL: z.url().default("https://mainnet.base.org"),
  ARBITRUM_RPC_URL: z.url().default("https://arbitrum-one-rpc.publicnode.com"),
  SOLANA_RPC_URL: z.url().default("https://api.mainnet-beta.solana.com"),
  SOLANA_TOP_ACCOUNTS_PER_TOKEN: integer(20, 20, 20),
  SOLANA_HISTORY_SIGNATURES_PER_ACCOUNT: integer(1, 1, 5),
  SCAN_BLOCKS: integer(100, 1, 1000),
  SCAN_CONFIRMATIONS: integer(20, 12, 1000),
  // Per-cycle batch size only. The persistent cursor rotates through the entire universe.
  MARKET_TOKEN_LIMIT: integer(100, 1, 1000),
  BASELINE_SCAN_INTERVAL_SECONDS: integer(21600, 60, 86400),
  SOLANA_BASELINE_INTERVAL_SECONDS: integer(21600, 3600, 604800),
  PASSIVE_SWAPS_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  SWAP_RECEIPTS_PER_WINDOW: integer(5, 1, 50),
  DATABASE_STORAGE_LIMIT_MB: integer(750, 50, 100000),
  ALPHA_REQUESTS_PER_MINUTE: integer(30, 1, 120),
  PROVIDER_PROCESS_REQUEST_BUDGET: integer(0, 0, 1000000),
  ALPHA_DAILY_REQUEST_LIMIT: integer(40000, 1, 1000000),
  FUTURES_DAILY_REQUEST_LIMIT: integer(5000, 1, 1000000),
  RPC_DAILY_REQUEST_LIMIT: integer(50000, 1, 1000000),
  ALCHEMY_DAILY_CU_LIMIT: integer(900000, 1, 1000000000),
  ALCHEMY_MONTHLY_CU_LIMIT: integer(27000000, 1, 1000000000),
  ALCHEMY_MONTHLY_UNTRACKED_CU: integer(0, 0, 1000000000),
  WORKER_RUN_SECONDS: integer(0, 0, 86400),
  WORKER_JOB_TIMEOUT_SECONDS: integer(900, 60, 7200),
  WORKER_STARTUP_TIMEOUT_SECONDS: integer(180, 1, 600),
  WORKER_MARKET_OVERLAP: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  TRANSFER_MIN_EVENTS: integer(25),
  TRANSFER_BASELINE_MULTIPLIER: z.coerce.number().min(2).max(100).default(3),
  TRANSFER_BASELINE_WINDOWS: integer(12, 6, 100),
  SIGNAL_COOLDOWN_MINUTES: integer(60),
  MIN_LIQUIDITY_USD: z.coerce.number().min(10000).default(100000),
  MAX_DATA_AGE_SECONDS: integer(900, 60, 3600),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  TELEGRAM_ENABLED: bool,
  TELEGRAM_WATCHLIST_ONLY: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  PAID_ENRICHMENT_ENABLED: bool,
  PAID_DAILY_BUDGET_USD: z.coerce.number().min(0).max(100).default(0),
});
export type Config = z.infer<typeof envSchema>;
export const config = () => envSchema.parse(process.env);
export function paidCallAllowed(
  enabled: boolean,
  budget: string,
  spent: string,
  reservation: string,
) {
  // This guard is also required inside an atomic DB reservation before any future paid adapter.
  return (
    enabled &&
    Number(budget) > 0 &&
    Number(spent) >= 0 &&
    Number(reservation) > 0 &&
    Number(spent) + Number(reservation) <= Number(budget)
  );
}
