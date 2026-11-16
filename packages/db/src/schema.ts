import {
  pgTable,
  text,
  timestamp,
  jsonb,
  boolean,
  numeric,
  integer,
  bigserial,
  uniqueIndex,
} from "drizzle-orm/pg-core";
export const alphaTokens = pgTable(
  "alpha_tokens",
  {
    id: text().primaryKey(),
    chainId: text("chain_id").notNull(),
    contract: text().notNull(),
    symbol: text().notNull(),
    name: text().notNull(),
    tokenId: text("token_id").notNull(),
    alphaId: text("alpha_id"),
    status: text().notNull(),
    firstSeen: timestamp("first_seen", { withTimezone: true }).notNull(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull(),
    metadata: jsonb().notNull(),
    deepSelected: boolean("deep_selected").notNull().default(false),
  },
  (t) => [uniqueIndex("token_identity").on(t.chainId, t.contract)],
);
export const providerRuns = pgTable("provider_runs", {
  id: bigserial({ mode: "number" }).primaryKey(),
  provider: text().notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  ok: boolean().notNull(),
  httpStatus: integer("http_status"),
  error: text(),
  latencyMs: integer("latency_ms").notNull(),
  costUsd: numeric("cost_usd").notNull(),
});
