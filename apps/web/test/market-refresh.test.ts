import { it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
const fixture = vi.hoisted(() => ({
  client: undefined as
    ReturnType<typeof import("@flownix/db").sqlClient> | undefined,
  ticker: vi.fn(),
}));
vi.mock("@flownix/db", async (original) => ({
  ...(await original<typeof import("@flownix/db")>()),
  sqlClient: () => {
    if (!fixture.client) throw Error("SCOPED_DB_REQUIRED");
    return fixture.client;
  },
}));
vi.mock("@flownix/core", async (original) => ({
  ...(await original<typeof import("@flownix/core")>()),
  AlphaProvider: class {
    ticker = fixture.ticker;
  },
}));
import { refreshMarketQuote } from "../lib/market-refresh";
it.skipIf(!process.env.DATABASE_URL)(
  "refreshes one exact quote, caches it, preserves history, rejects mismatches and enforces durable owner budgets",
  async () => {
    const db =
      await vi.importActual<typeof import("@flownix/db")>("@flownix/db");
    const sql = db.sqlClient();
    let checked = false;
    try {
      await sql.begin(async (tx) => {
        const schema = "quote_" + randomUUID().replaceAll("-", "");
        await tx.unsafe(`CREATE SCHEMA ${schema}`);
        await tx.unsafe(`SET LOCAL search_path TO ${schema}`);
        for (const f of (await readdir("packages/db/migrations"))
          .filter((f) => f.endsWith(".sql"))
          .sort())
          await tx.unsafe(
            await readFile(`packages/db/migrations/${f}`, "utf8"),
          );
        fixture.client = Object.assign(tx, {
          begin: tx.savepoint.bind(tx),
        }) as unknown as typeof sql;
        const id = "e".repeat(32);
        await tx`INSERT INTO alpha_tokens(id,chain_id,contract,symbol,name,token_id,alpha_id,status,first_seen,last_seen,source,response_hash,metadata) VALUES(${id},'56',${"0x" + "e".repeat(40)},'EVAA','Synthetic quote regression','evaa','ALPHA_409','current',now(),now(),'synthetic-test-only','fixture','{}')`;
        await tx`INSERT INTO market_symbols(symbol,alpha_id,quote_asset,status,observed_at,raw) VALUES('ALPHA_409USDT','ALPHA_409','USDT','TRADING',now(),'{}')`;
        await tx`INSERT INTO market_snapshots(token_id,symbol,source,source_kind,quote_asset,observed_at,provider_time,price,response_hash,raw) VALUES(${id},'ALPHA_409USDT','synthetic-test-only','alpha_market','USDT',now()-interval '12 hours',now()-interval '12 hours',2.77172380,'old','{}')`;
        fixture.ticker.mockImplementation(async (symbol: string) => {
          const raw = JSON.stringify({
            symbol,
            lastPrice: "2.32",
            closeTime: Date.now(),
            priceChangePercent: "-10",
            quoteVolume: "100",
            volume: "40",
          });
          return {
            data: JSON.parse(raw),
            source: "https://www.binance.com/synthetic-test-only",
            observedAt: new Date().toISOString(),
            hash: "fixture",
            raw,
            serverDate: null,
          };
        });
        expect(await refreshMarketQuote(id)).toContain("ALPHA_409USDT");
        expect(fixture.ticker).toHaveBeenCalledTimes(1);
        expect(await refreshMarketQuote(id)).toContain("already collected");
        expect(fixture.ticker).toHaveBeenCalledTimes(1);
        const rows =
          await tx`SELECT price::text,quote_asset,provider_time,observed_at FROM market_snapshots ORDER BY observed_at`;
        expect(rows.map((r) => Number(r.price))).toEqual([2.7717238, 2.32]);
        expect(rows[1].quote_asset).toBe("USDT");
        await tx`UPDATE market_snapshots SET observed_at=now()-interval '1 hour',provider_time=now()-interval '1 hour' WHERE response_hash='fixture'`;
        await expect(refreshMarketQuote(id)).rejects.toThrow("cooling down");
        await tx`DELETE FROM api_rate_limits WHERE key<>'owner:quote:day'`;
        await tx`UPDATE api_rate_limits SET hits=6 WHERE key='owner:quote:day'`;
        await expect(refreshMarketQuote(id)).rejects.toThrow(
          "Daily owner quote budget",
        );
        expect(fixture.ticker).toHaveBeenCalledTimes(1);
        await tx`UPDATE api_rate_limits SET hits=0`;
        fixture.ticker.mockResolvedValue({
          data: { symbol: "EVAAUSDT", lastPrice: "999", closeTime: Date.now() },
          observedAt: new Date().toISOString(),
        });
        await expect(refreshMarketQuote(id)).rejects.toThrow(
          "identity or price invalid",
        );
        expect(
          (await tx`SELECT count(*)::int AS n FROM market_snapshots`)[0].n,
        ).toBe(2);
        await tx`UPDATE market_symbols SET status='DELISTED'`;
        await expect(refreshMarketQuote(id)).rejects.toThrow(
          "No recently verified",
        );
        checked = true;
        throw Error("ROLLBACK_QUOTE_FIXTURE");
      });
    } catch (e) {
      if (!(e instanceof Error) || e.message !== "ROLLBACK_QUOTE_FIXTURE")
        throw e;
    } finally {
      fixture.client = undefined;
      await db.closeDb();
    }
    expect(checked).toBe(true);
  },
);
