import { z } from "zod";
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
  BSC_RPC_URL: z.url().default("https://bsc-rpc.publicnode.com"),
  ETH_RPC_URL: z.url().default("https://ethereum-rpc.publicnode.com"),
  BASE_RPC_URL: z.url().default("https://mainnet.base.org"),
  SCAN_BLOCKS: integer(100, 1, 1000),
  SCAN_CONFIRMATIONS: integer(20, 12, 1000),
  DEEP_TOKEN_LIMIT: integer(15, 1, 20),
  MARKET_TOKEN_LIMIT: integer(15, 1, 1000),
  ALPHA_REQUESTS_PER_MINUTE: integer(30, 1, 120),
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
    .default("true")
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
