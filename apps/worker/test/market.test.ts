import { describe, expect, it, vi } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const fixture = vi.hoisted(() => ({
  client: undefined as
    ReturnType<typeof import("@flownix/db").sqlClient> | undefined,
  exchange: vi.fn(),
  ticker: vi.fn(),
}));
vi.mock("@flownix/core", async (original) => {
  const core = await original<typeof import("@flownix/core")>();
  return {
    ...core,
    config: () => ({ ...core.config(), MARKET_TOKEN_LIMIT: 2 }),
    AlphaProvider: class {
      exchange = fixture.exchange;
      ticker = fixture.ticker;
    },
  };
});
vi.mock("@flownix/db", async (original) => {
  const db = await original<typeof import("@flownix/db")>();
  const scoped = () => {
    if (!fixture.client) throw Error("ROLLBACK_SCOPE_REQUIRED");
    return fixture.client;
  };
  return {
    ...db,
    sqlClient: scoped,
    saveSource: async () => {},
    setSetting: async (key: string, value: unknown) => {
      await scoped()`INSERT INTO settings(key,value) VALUES(${key},${db.jsonParam(value)}::jsonb) ON CONFLICT(key) DO UPDATE SET value=excluded.value`;
    },
  };
});
import { marketSync } from "../src/ingest";
import { hashResponse } from "@flownix/core";

describe.skipIf(!process.env.DATABASE_URL)(
  "Market progression — isolated PostgreSQL rollback",
  () => {
    it("commits actual ticker provenance atomically, rotates beyond the batch and defers no-pair checks", async () => {
      const db =
        await vi.importActual<typeof import("@flownix/db")>("@flownix/db");
      const sql = db.sqlClient();
      const observe = <T>(data: T) => {
        const raw = JSON.stringify({ code: "000000", data });
        return {
          data,
          raw,
          hash: hashResponse(raw),
          source: "https://fixture.invalid/alpha",
          observedAt: new Date().toISOString(),
          serverDate: null,
        };
      };
      const symbols = [1, 3].map((i) => ({
        symbol: `ALPHA_${i}USDT`,
        baseAsset: `ALPHA_${i}`,
        quoteAsset: "USDT",
        status: "TRADING",
      }));
      fixture.exchange.mockImplementation(async () => observe({ symbols }));
      fixture.ticker.mockImplementation(async (symbol: string) =>
        observe({
          symbol,
          lastPrice: "1.25",
          priceChangePercent: "2",
          quoteVolume: "1000",
          volume: "800",
          closeTime: Date.now(),
        }),
      );
      let verified = false;
      try {
        await sql.begin(async (tx) => {
          const schema = `test_${randomUUID().replaceAll("-", "")}`;
          await tx.unsafe(`CREATE SCHEMA ${schema}`);
          await tx.unsafe(`SET LOCAL search_path TO ${schema}`);
          for (const name of (await readdir("packages/db/migrations"))
            .filter((name) => name.endsWith(".sql"))
            .sort())
            await tx.unsafe(
              await readFile(`packages/db/migrations/${name}`, "utf8"),
            );
          fixture.client = Object.assign(tx, {
            begin: tx.savepoint.bind(tx),
          }) as unknown as ReturnType<typeof db.sqlClient>;
          for (const i of [1, 2, 3]) {
            await tx`INSERT INTO alpha_tokens(id,chain_id,contract,symbol,name,token_id,alpha_id,status,first_seen,last_seen,source,response_hash,metadata) VALUES(${String(i)},'56',${"0x" + String(i).repeat(40)},'SYNTHETIC','Rollback fixture',${String(i)},${`ALPHA_${i}`},'current',now(),now(),'fixture-only','fixture','{"liquidity":"100000"}')`;
          }
          expect(await marketSync()).toEqual({ remainingDue: 1 });
          expect(fixture.ticker).toHaveBeenCalledTimes(1);
          expect(
            (await tx`SELECT status FROM market_coverage WHERE token_id='2'`)[0]
              .status,
          ).toBe("no_pair");
          expect(await marketSync()).toEqual({ remainingDue: 0 });
          expect(fixture.ticker).toHaveBeenCalledTimes(2);
          await marketSync();
          expect(fixture.ticker).toHaveBeenCalledTimes(2);
          const rows =
            await tx`SELECT m.price::text,c.raw->>'responseHash' AS coverage_hash,m.response_hash,r.raw_text,jsonb_typeof(r.payload) AS payload_type FROM market_snapshots m JOIN market_coverage c ON c.token_id=m.token_id JOIN source_responses r ON r.hash=m.response_hash`;
          expect(rows).toHaveLength(2);
          expect(
            rows.every(
              (r) =>
                Number(r.price) === 1.25 &&
                r.coverage_hash === r.response_hash &&
                r.payload_type === "object" &&
                hashResponse(r.raw_text) === r.response_hash,
            ),
          ).toBe(true);
          fixture.exchange.mockImplementation(async () =>
            observe({
              symbols: [
                ...symbols,
                {
                  symbol: "ALPHA_2USDT",
                  baseAsset: "ALPHA_2",
                  quoteAsset: "USDT",
                  status: "TRADING",
                },
              ],
            }),
          );
          expect(await marketSync()).toEqual({ remainingDue: 0 });
          expect(fixture.ticker).toHaveBeenCalledTimes(3);
          expect(
            (await tx`SELECT status FROM market_coverage WHERE token_id='2'`)[0]
              .status,
          ).toBe("observed");
          // Both due tickers can progress while a peer awaits I/O, with a
          // strict two-request bound rather than one task per registry row.
          await tx`UPDATE market_coverage SET checked_at=now()-interval '10 minutes' WHERE token_id IN ('1','3')`;
          let inFlight = 0,
            peakInFlight = 0;
          fixture.ticker.mockImplementation(async (symbol: string) => {
            inFlight++;
            peakInFlight = Math.max(peakInFlight, inFlight);
            await new Promise((resolve) => setTimeout(resolve, 5));
            inFlight--;
            return observe({
              symbol,
              lastPrice: "1.25",
              priceChangePercent: "2",
              quoteVolume: "1000",
              volume: "800",
              closeTime: Date.now(),
            });
          });
          await marketSync();
          expect(peakInFlight).toBe(2);
          // A snapshot failure must roll back its provenance and coverage too.
          await tx`UPDATE market_coverage SET checked_at=now()-interval '10 minutes' WHERE token_id='1'`;
          await tx.unsafe(
            "ALTER TABLE market_snapshots ADD CONSTRAINT reject_fixture CHECK(price < 0) NOT VALID",
          );
          const before =
            await tx`SELECT count(*)::int AS n FROM source_responses`;
          await tx
            .savepoint(async (sp) => {
              fixture.client = Object.assign(sp, {
                begin: sp.savepoint.bind(sp),
              }) as unknown as ReturnType<typeof db.sqlClient>;
              // PostgreSQL aborts the savepoint on the intentional CHECK failure.
              await expect(marketSync()).rejects.toBeDefined();
              throw Error("ROLLBACK_REJECTED_TICKER");
            })
            .catch((e) => {
              if (e.message !== "ROLLBACK_REJECTED_TICKER") throw e;
            });
          fixture.client = tx as unknown as ReturnType<typeof db.sqlClient>;
          expect(
            (await tx`SELECT count(*)::int AS n FROM source_responses`)[0].n,
          ).toBe(before[0].n);
          expect(
            (
              await tx`SELECT checked_at<now()-interval '5 minutes' AS stale FROM market_coverage WHERE token_id='1'`
            )[0].stale,
          ).toBe(true);
          verified = true;
          throw Error("ROLLBACK_MARKET_FIXTURES");
        });
      } catch (e) {
        if (!(e instanceof Error) || e.message !== "ROLLBACK_MARKET_FIXTURES")
          throw e;
      } finally {
        fixture.client = undefined;
        await db.closeDb();
      }
      expect(verified).toBe(true);
    });
  },
);
