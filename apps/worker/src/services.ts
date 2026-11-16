import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  config,
  quoteUsable,
  outcomeWindows,
  HttpClient,
  explorerUrl,
  simulateOutcome,
  defaultPaperAssumptions,
  type Candle,
  researchWindows,
  accumulationPersistence,
} from "@flownix/core";
import { jsonParam, sqlClient, auditRequest, setSetting } from "@flownix/db";
export async function enqueueTelegramTest() {
  const sql = sqlClient();
  await sql`INSERT INTO notification_deliveries(id,channel,status,payload) VALUES(${randomUUID()},'telegram','queued',${jsonParam({ test: true, text: "Flownix connection test — independent Alpha research. Simulation only. No trading action." })}::jsonb)`;
}
export async function deliverNotifications() {
  const sql = sqlClient(),
    c = config();
  if (!c.TELEGRAM_ENABLED || !c.TELEGRAM_BOT_TOKEN || !c.TELEGRAM_CHAT_ID)
    return;
  const queued =
    await sql`SELECT * FROM notification_deliveries WHERE channel='telegram' AND status='queued' AND next_attempt_at<=now() ORDER BY created_at LIMIT 5`;
  const http = new HttpClient("telegram", 20, auditRequest);
  for (const n of queued) {
    try {
      const r = await http.json(
        `https://api.telegram.org/bot${c.TELEGRAM_BOT_TOKEN}/sendMessage`,
        (body) =>
          z
            .object({
              ok: z.literal(true),
              result: z.object({ message_id: z.number() }),
            })
            .parse(body),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: c.TELEGRAM_CHAT_ID,
            text: String(n.payload.text).slice(0, 4000),
            link_preview_options: { is_disabled: true },
          }),
        },
      );
      await sql`UPDATE notification_deliveries SET status='delivered',delivered_at=now(),attempts=attempts+1,receipt=${String(r.data.result.message_id)},error=null WHERE id=${n.id}`;
    } catch {
      await sql`UPDATE notification_deliveries SET attempts=attempts+1,status=CASE WHEN attempts>=4 THEN 'failed' ELSE 'queued' END,next_attempt_at=now()+(power(2,least(attempts,8))*interval '1 minute'),error='DELIVERY_FAILED' WHERE id=${n.id}`;
    }
  }
}
export async function queueResearchAlerts() {
  const c = config();
  if (!c.TELEGRAM_ENABLED) return;
  const sql = sqlClient();
  const rows =
    await sql`SELECT s.*,t.symbol,t.chain_id,t.contract,t.metadata FROM signal_events s JOIN alpha_tokens t ON t.id=s.token_id LEFT JOIN watchlists w ON w.token_id=t.id WHERE s.status='active' AND s.first_detected_at>now()-interval '15 minutes' AND (${!c.TELEGRAM_WATCHLIST_ONLY} OR (w.token_id IS NOT NULL AND NOT w.archived)) AND NOT EXISTS (SELECT 1 FROM notification_deliveries n WHERE n.signal_id=s.id AND n.channel='telegram') LIMIT 10`;
  for (const s of rows) {
    const evidence =
      await sql`SELECT * FROM signal_evidence WHERE signal_id=${s.id} LIMIT 3`;
    const text = `Flownix research — ${s.symbol} (${s.chain_id}, ${s.contract})\n${s.kind}\n${s.message}\nPrice at first detection: ${s.price_at_detection} ${s.quote_asset}. First detected ${new Date(s.first_detected_at).toISOString()}. Evidence confidence: ${s.evidence_confidence}.\nLiquidity (registry metadata): ${s.metadata.liquidity ?? "unknown"}.\nUnknown: buys, entity ownership and intent. Investigate; this is not a prediction.\n${evidence
      .map((e) => explorerUrl(e.chain_id, "tx", e.tx_hash))
      .filter(Boolean)
      .join("\n")}`;
    await sql`INSERT INTO notification_deliveries(id,signal_id,channel,status,payload) VALUES(${randomUUID()},${s.id},'telegram','queued',${jsonParam({ text })}::jsonb) ON CONFLICT(signal_id,channel) DO NOTHING`;
  }
}
export async function persistenceSync() {
  const sql = sqlClient();
  const tokens =
    await sql`SELECT * FROM alpha_tokens WHERE deep_selected OR id IN (SELECT token_id FROM watchlists WHERE NOT archived)`;
  const now = new Date().toISOString();
  for (const t of tokens) {
    // No swap decoder is verified yet. Explicit empty purchase ledger is an unavailable capability, not zero buying.
    for (const days of researchWindows) {
      const start = new Date(Date.now() - days * 86400000).toISOString();
      const result = accumulationPersistence([], start, now, now);
      await sql`INSERT INTO accumulation_observations(token_id,window_days,computed_at,window_start,window_end,coverage,metrics) VALUES(${t.id},${days},${now},${start},${now},${jsonParam({ purchaseDecoder: "unavailable", verifiedDays: 0, requestedDays: days })}::jsonb,${jsonParam(result)}::jsonb) ON CONFLICT DO NOTHING`;
    }
    if (t.research_state === "DISCOVERY")
      await sql.begin(async (tx) => {
        await tx`UPDATE alpha_tokens SET research_state='INSUFFICIENT EVIDENCE' WHERE id=${t.id}`;
        await tx`INSERT INTO research_state_history(token_id,from_state,to_state,observed_at,rule_version,evidence,reason) VALUES(${t.id},'DISCOVERY','INSUFFICIENT EVIDENCE',${now},'persistence/1',${jsonParam({ verifiedPurchaseCoverage: false })}::jsonb,'No verified swap history or independently measured retention. Monitoring continues without resetting the watchlist.')`;
      });
  }
  await setSetting("persistence_sync", {
    at: now,
    tokens: tokens.length,
    windows: researchWindows,
    verifiedPurchaseAdapter: false,
  });
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
