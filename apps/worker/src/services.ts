import { walletResearchSync } from "./wallet-research";
import { graphResearchSync } from "./graph-research";
import {
  quoteUsable,
  outcomeWindows,
  simulateOutcome,
  defaultPaperAssumptions,
  type Candle,
} from "@flownix/core";
import { sqlClient, jsonParam } from "@flownix/db";
export {
  deliverNotifications,
  enqueueTelegramTest,
  queueResearchAlerts,
} from "./telegram";
export async function persistenceSync() {
  await graphResearchSync();
  await walletResearchSync();
}
function candle(r: Record<string, unknown>): Candle {
  return {
    openAt: new Date(r.open_at as string).toISOString(),
    closeAt: new Date(r.close_at as string).toISOString(),
    availableAt: new Date(r.available_at as string).toISOString(),
    open: String(r.open),
    high: String(r.high),
    low: String(r.low),
    close: String(r.close),
    volume: String(r.volume),
  };
}
export async function outcomesSync() {
  const sql = sqlClient();
  const signals =
    await sql`SELECT s.*,t.first_seen,m.symbol,m.liquidity FROM signal_events s JOIN alpha_tokens t ON t.id=s.token_id JOIN market_snapshots m ON m.id=s.market_snapshot_id WHERE s.status='active' ORDER BY s.first_detected_at DESC LIMIT 200`;
  for (const s of signals) {
    const signalTime = new Date(s.first_detected_at).getTime();
    const entries =
      await sql`SELECT * FROM market_snapshots WHERE token_id=${s.token_id} AND symbol=${s.symbol} AND book IS NOT NULL AND observed_at>=${new Date(signalTime + 60000).toISOString()} AND observed_at<=${new Date(signalTime + 900000).toISOString()} ORDER BY observed_at LIMIT 1`;
    const entry = entries[0];
    if (!entry) continue;
    const entryAt = new Date(entry.book.observedAt).toISOString();
    if (!quoteUsable(entry.book, entryAt)) continue;
    for (const hours of outcomeWindows) {
      const due = new Date(Date.parse(entryAt) + hours * 3600000).toISOString();
      if (due > new Date().toISOString()) continue;
      if (
        (
          await sql`SELECT signal_id FROM signal_outcomes WHERE signal_id=${s.id} AND horizon_hours=${hours}`
        ).length
      )
        continue;
      const exits =
        await sql`SELECT * FROM market_snapshots WHERE token_id=${s.token_id} AND symbol=${s.symbol} AND quote_asset=${entry.quote_asset} AND book IS NOT NULL AND observed_at>=${due} AND observed_at<=${new Date(Date.parse(due) + 900000).toISOString()} ORDER BY observed_at LIMIT 1`;
      const exit = exits[0];
      if (!exit) continue;
      const exitAt = new Date(exit.book.observedAt).toISOString();
      if (!quoteUsable(exit.book, exitAt)) continue;
      const rows =
        await sql`SELECT * FROM ohlcv_candles WHERE symbol=${s.symbol} AND open_at>=${entryAt} AND close_at<=${exitAt} ORDER BY open_at`;
      const path = rows.map(candle);
      if (
        path.some(
          (r, i) =>
            i > 0 &&
            Date.parse(r.openAt) - Date.parse(path[i - 1].openAt) !== 3600000,
        )
      )
        continue;
      try {
        const entryCandle = {
          openAt: entryAt,
          closeAt: entryAt,
          availableAt: entryAt,
          open: entry.book.ask,
          high: entry.book.ask,
          low: entry.book.ask,
          close: entry.book.ask,
          volume: "0",
        };
        const exitCandle = {
          openAt: exitAt,
          closeAt: exitAt,
          availableAt: exitAt,
          open: exit.book.bid,
          high: exit.book.bid,
          low: exit.book.bid,
          close: exit.book.bid,
          volume: "0",
        };
        const result = simulateOutcome({
          signalAt: new Date(s.first_detected_at).toISOString(),
          membershipFirstSeen: new Date(s.first_seen).toISOString(),
          entry: entryCandle,
          exit: exitCandle,
          path,
          entryQuote: entry.book,
          exitQuote: exit.book,
          assumptions: {
            ...defaultPaperAssumptions,
            liquidity: String(entry.liquidity),
          },
        });
        await sql`INSERT INTO signal_outcomes(signal_id,horizon_hours,computed_at,evidence) VALUES(${s.id},${hours},now(),${jsonParam({ ...result, entryAt, exitAt, sourceSymbol: s.symbol, quoteAsset: entry.quote_asset, entryBookHash: entry.book.hash, exitBookHash: exit.book.hash, pathCoverageCandles: path.length })}::jsonb) ON CONFLICT DO NOTHING`;
      } catch {
        /* Unavailable observed quotes or size constraints never become an assumed candle fill. */
      }
    }
  }
}
