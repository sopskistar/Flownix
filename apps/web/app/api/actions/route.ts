import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import { NextResponse } from "next/server";
import { z } from "zod";
import { accessAllowed } from "../../../lib/auth";
import { jsonParam, sqlClient, setSetting } from "@flownix/db";
import {
  config,
  oauthConfiguration,
  quoteUsable,
  researchStates,
  freshness,
  researchLeadSchema,
  isChainAddress,
  contractIdentity,
} from "@flownix/core";
export const dynamic = "force-dynamic";
const tokenId = z.string().regex(/^[a-f0-9]{32}$/),
  uuid = z.string().uuid();
const schemas = z.discriminatedUnion("action", [
  researchLeadSchema,
  z.object({ action: z.literal("sync") }),
  z.object({
    action: z.literal("classification"),
    tokenId,
    classification: z.enum([
      "verified_non_meme",
      "verified_meme_focused",
      "mixed_ambiguous",
      "unclassified",
    ]),
    evidenceUrl: z.url().max(2000),
    evidenceNote: z.string().min(10).max(3000),
  }),
  z.object({ action: z.literal("watch"), tokenId, enabled: z.boolean() }),
  z.object({ action: z.literal("archive"), tokenId, archived: z.boolean() }),
  z.object({
    action: z.literal("note"),
    tokenId: tokenId.optional(),
    signalId: uuid.optional(),
    chain: z.string().max(20).optional(),
    address: z.string().max(100).optional(),
    body: z.string().min(3).max(5000),
  }),
  z.object({
    action: z.literal("signal_status"),
    signalId: uuid,
    status: z.enum(["active", "dismissed", "false_positive"]),
  }),
  z.object({
    action: z.literal("thesis_state"),
    tokenId,
    state: z.enum(researchStates),
    reason: z.string().min(10).max(2000),
  }),
  z.object({
    action: z.literal("thresholds"),
    minEvents: z.coerce.number().int().min(5).max(100000),
    multiplier: z.coerce.number().min(2).max(100),
    baselineWindows: z.coerce.number().int().min(6).max(100),
    minLiquidity: z.coerce.number().min(10000).max(1e12),
  }),
  z.object({
    action: z.literal("notification_test"),
    channel: z.enum(["in_app", "telegram"]),
  }),
  z.object({
    action: z.literal("label"),
    chain: z.string().max(20),
    address: z.string().max(100),
    role: z.enum([
      "unknown",
      "possible_exchange",
      "verified_exchange",
      "possible_market_maker",
      "verified_market_maker",
      "possible_team/treasury",
      "verified_team/treasury",
      "vesting",
      "DEX_pool",
      "router",
      "burn",
      "bridge",
    ]),
    entity: z.string().max(100),
    sourceUrl: z.url().max(2000),
    notes: z.string().min(10).max(3000),
  }),
  z.object({
    action: z.literal("paper_enter"),
    tokenId,
    notional: z.coerce.number().positive().max(10000),
    budget: z.coerce.number().positive().max(1000000),
    feeBps: z.coerce.number().min(0).max(500),
    slippageBps: z.coerce.number().min(10).max(2000),
    gasQuote: z.coerce.number().min(0).max(100),
    note: z.string().max(2000),
  }),
  z.object({ action: z.literal("paper_exit"), tradeId: uuid }),
]);
export async function POST(request: Request) {
  if (!(await accessAllowed()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const origin = request.headers.get("origin");
  const expected =
    process.env.ACCESS_MODE === "oauth"
      ? oauthConfiguration().origin
      : `http://${request.headers.get("host")}`;
  if (!origin || origin !== expected)
    return NextResponse.json({ error: "Origin rejected" }, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 16000)
    return NextResponse.json({ error: "Request too large" }, { status: 413 });
  try {
    const raw = await request.text();
    if (raw.length > 16000)
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    const data = schemas.parse(JSON.parse(raw));
    const sql = sqlClient();
    const rate =
      await sql`INSERT INTO api_rate_limits(key,window_start,hits) VALUES('owner:mutation',now(),1) ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN api_rate_limits.window_start<now()-interval '1 minute' THEN 1 ELSE api_rate_limits.hits+1 END,window_start=CASE WHEN api_rate_limits.window_start<now()-interval '1 minute' THEN now() ELSE api_rate_limits.window_start END RETURNING hits`;
    if (rate[0].hits > 60)
      return NextResponse.json(
        { error: "Rate limit reached. Try again in one minute." },
        { status: 429 },
      );
    if ("tokenId" in data && data.tokenId) {
      if (
        !(await sql`SELECT id FROM alpha_tokens WHERE id=${data.tokenId}`)
          .length
      )
        return NextResponse.json(
          { error: "Unknown Alpha identity" },
          { status: 404 },
        );
    }
    if (data.action === "sync") {
      await sql`INSERT INTO worker_jobs(key,kind) VALUES('registry','registry') ON CONFLICT(key) DO UPDATE SET run_after=now(),status=CASE WHEN worker_jobs.status='running' THEN 'running' ELSE 'queued' END`;
      return NextResponse.json({
        message: "Sync queued. The persistent worker must be running.",
      });
    }
    if (data.action === "research_lead") {
      if (
        data.claimedPublishedAt &&
        Date.parse(data.claimedPublishedAt) > Date.now() + 30000
      )
        throw Error("Invalid publication time");
      await sql.begin(async (tx) => {
        if (
          data.revisionOf &&
          !(
            await tx`SELECT id FROM research_leads WHERE id=${data.revisionOf} AND token_id=${data.tokenId} AND kind=${data.kind}`
          ).length
        )
          throw Error("Invalid revision reference");
        await tx`INSERT INTO research_leads(id,token_id,kind,source_url,author,body,claimed_published_at,claimed_event_at,revision_of) VALUES(${randomUUID()},${data.tokenId},${data.kind},${data.sourceUrl},${data.author},${data.body},${data.claimedPublishedAt || null},${data.claimedEventAt || null},${data.revisionOf || null})`;
      });
      return NextResponse.json({
        message:
          "Source-linked lead saved. Publication/event times are claims awaiting verification; this is not an automatic social observation.",
      });
    }
    if (data.action === "classification") {
      if (!["http:", "https:"].includes(new URL(data.evidenceUrl).protocol))
        throw Error("Classification evidence must be an HTTP or HTTPS URL");
      await sql`INSERT INTO token_project_classifications(token_id,classification,evidence_url,evidence_note,reviewed_by,reviewed_at) VALUES(${data.tokenId},${data.classification},${data.evidenceUrl},${data.evidenceNote},'owner',now()) ON CONFLICT(token_id) DO UPDATE SET classification=excluded.classification,evidence_url=excluded.evidence_url,evidence_note=excluded.evidence_note,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at`;
      return NextResponse.json({
        message:
          "Classification saved with its cited evidence. Owner review is recorded; it is not independently verified by Flownix.",
      });
    }
    if (data.action === "watch") {
      if (data.enabled)
        await sql`INSERT INTO watchlists(token_id) VALUES(${data.tokenId}) ON CONFLICT(token_id) DO UPDATE SET archived=false`;
      else
        await sql`UPDATE watchlists SET archived=true WHERE token_id=${data.tokenId}`;
    }
    if (data.action === "archive")
      await sql`UPDATE watchlists SET archived=${data.archived} WHERE token_id=${data.tokenId}`;
    if (data.action === "note") {
      if (
        data.address &&
        (!data.chain || !isChainAddress(data.chain, data.address))
      )
        throw Error("Invalid address");
      await sql`INSERT INTO manual_research_notes(token_id,signal_id,chain_id,address,body,added_by) VALUES(${data.tokenId ?? null},${data.signalId ?? null},${data.chain ?? null},${data.address && data.chain ? contractIdentity(data.chain, data.address).contract : null},${data.body},'owner')`;
    }
    if (data.action === "signal_status")
      await sql`UPDATE signal_events SET status=${data.status} WHERE id=${data.signalId}`;
    if (data.action === "thesis_state")
      await sql.begin(async (tx) => {
        const r =
          await tx`SELECT research_state FROM alpha_tokens WHERE id=${data.tokenId} FOR UPDATE`;
        await tx`UPDATE alpha_tokens SET research_state=${data.state} WHERE id=${data.tokenId}`;
        await tx`INSERT INTO research_state_history(token_id,from_state,to_state,observed_at,rule_version,evidence,reason) VALUES(${data.tokenId},${r[0].research_state},${data.state},now(),'manual-hypothesis/1','{"author":"owner","verified":false}'::jsonb,${data.reason})`;
      });
    if (data.action === "thresholds") {
      await setSetting("transfer_thresholds", {
        minEvents: data.minEvents,
        multiplier: data.multiplier,
        baselineWindows: data.baselineWindows,
        minLiquidity: data.minLiquidity,
        maxAgeSeconds: config().MAX_DATA_AGE_SECONDS,
      });
    }
    if (data.action === "notification_test") {
      if (
        data.channel === "telegram" &&
        (!config().TELEGRAM_ENABLED ||
          !config().TELEGRAM_BOT_TOKEN ||
          !config().TELEGRAM_CHAT_ID)
      )
        return NextResponse.json(
          {
            error:
              "Telegram is not configured. Set server environment values and restart the worker.",
          },
          { status: 400 },
        );
      await sql`INSERT INTO notification_deliveries(id,channel,status,delivered_at,payload) VALUES(${randomUUID()},${data.channel},${data.channel === "in_app" ? "delivered" : "queued"},${data.channel === "in_app" ? new Date().toISOString() : null},${jsonParam({ test: true, text: "Flownix connection test — independent Alpha research. No trading action." })}::jsonb)`;
      return NextResponse.json({
        message:
          data.channel === "in_app"
            ? "In-app test recorded. View Alerts."
            : "Telegram test queued; delivery is confirmed only after a worker receipt.",
      });
    }
    if (data.action === "label") {
      if (
        !isChainAddress(data.chain, data.address) ||
        !["http:", "https:"].includes(new URL(data.sourceUrl).protocol)
      )
        throw Error("Invalid label input");
      // User-supplied source is stored and linked, never fetched server-side. Manual assertion is not independent verification.
      await sql`INSERT INTO wallet_labels(chain_id,address,role,entity,source_url,confidence,valid_from,added_by,notes) VALUES(${data.chain},${contractIdentity(data.chain, data.address).contract},${data.role},${data.entity},${data.sourceUrl},'manual — independently unverified',now(),'owner',${data.notes})`;
    }
    if (data.action === "paper_enter") {
      await sql.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(726033)`;
        const rows =
          await tx`SELECT m.*,t.status,t.last_seen FROM market_snapshots m JOIN alpha_tokens t ON t.id=m.token_id WHERE m.token_id=${data.tokenId} AND m.source_kind='alpha_market' ORDER BY m.observed_at DESC LIMIT 1`;
        const m = rows[0];
        if (
          !m ||
          m.status !== "current" ||
          freshness(m.last_seen) !== "current" ||
          freshness(m.observed_at) !== "current" ||
          freshness(m.provider_time) !== "current" ||
          !m.price ||
          Number(m.price) <= 0
        )
          throw Error("Fresh Alpha market quote required");
        if (
          !m.liquidity ||
          Number(m.liquidity) < 100000 ||
          data.notional > data.budget * 0.1
        )
          throw Error("Liquidity or per-trade exposure limit exceeded");
        const exposure =
          await tx`SELECT coalesce(sum(notional),0)::text AS value FROM paper_trades WHERE status='open' AND quote_asset=${m.quote_asset}`;
        if (
          new Decimal(exposure[0].value)
            .plus(data.notional)
            .gt(data.budget * 0.5)
        )
          throw Error("Maximum aggregate exposure is 50% of the quote budget");
        if (!quoteUsable(m.book, new Date().toISOString()))
          throw Error("Fresh observed Alpha depth quote required");
        if (
          new Decimal(data.notional).gt(
            new Decimal(m.book.ask).mul(m.book.askQuantity),
          )
        )
          throw Error("Liquidity at the observed ask is insufficient");
        if (
          new Decimal(data.notional).gt(
            new Decimal(m.book.ask).mul(m.book.askQuantity).mul("0.001"),
          )
        )
          throw Error(
            "Liquidity: position exceeds 0.1% of displayed ask notional",
          );
        const fill = new Decimal(m.book.ask).mul(1 + data.slippageBps / 10000);
        const qty = new Decimal(data.notional)
          .minus(data.gasQuote)
          .div(1 + data.feeBps / 10000)
          .div(fill);
        if (qty.lte(0)) throw Error("Costs exceed notional");
        await tx`INSERT INTO paper_trades(id,token_id,entry_at,entry_snapshot_id,quote_asset,entry_price,notional,quantity,assumptions,note) VALUES(${randomUUID()},${data.tokenId},now(),${m.id},${m.quote_asset},${fill.toFixed()},${data.notional},${qty.toFixed()},${jsonParam({ ...data, simulationOnly: true, fillModel: "Observed Alpha ask plus adverse slippage and costs; displayed size may disappear", quoteObservedAt: m.book.observedAt, bookHash: m.book.hash, maxExposurePct: 10, maxAggregateExposurePct: 50 })}::jsonb,${data.note})`;
      });
    }
    if (data.action === "paper_exit")
      await sql.begin(async (tx) => {
        const rows =
          await tx`SELECT * FROM paper_trades WHERE id=${data.tradeId} AND status='open' FOR UPDATE`;
        if (!rows.length) throw Error("Open paper entry not found");
        const trade = rows[0];
        const quotes =
          await tx`SELECT * FROM market_snapshots WHERE token_id=${trade.token_id} AND source_kind='alpha_market' AND quote_asset=${trade.quote_asset} ORDER BY observed_at DESC LIMIT 1`;
        const m = quotes[0];
        if (
          !m ||
          freshness(m.observed_at) !== "current" ||
          freshness(m.provider_time) !== "current"
        )
          throw Error("Fresh quote required for exit");
        const a = trade.assumptions;
        if (!quoteUsable(m.book, new Date().toISOString()))
          throw Error("Fresh observed Alpha bid required");
        if (new Decimal(trade.quantity).gt(m.book.bidQuantity))
          throw Error("Liquidity at the observed bid is insufficient");
        const exit = new Decimal(m.book.bid).mul(
          1 - Number(a.slippageBps) / 10000,
        );
        const proceeds = new Decimal(trade.quantity)
          .mul(exit)
          .mul(1 - Number(a.feeBps) / 10000)
          .minus(a.gasQuote);
        await tx`UPDATE paper_trades SET status='closed',exit_at=now(),exit_price=${exit.toFixed()},net_pnl=${proceeds.minus(trade.notional).toFixed()},assumptions=assumptions || ${jsonParam({ exitMarketSnapshotId: m.id, exitBookHash: m.book.hash, exitBookObservedAt: m.book.observedAt })}::jsonb WHERE id=${data.tradeId}`;
      });
    return NextResponse.json({ message: "Saved" });
  } catch (e) {
    if (e instanceof z.ZodError)
      return NextResponse.json(
        { error: "Invalid fields. Review values and required inputs." },
        { status: 400 },
      );
    const known =
      e instanceof Error &&
      /^(Fresh |Liquidity |Maximum |Costs |Open paper|Invalid address|Invalid label)/.test(
        e.message,
      );
    return NextResponse.json(
      {
        error: known
          ? (e as Error).message
          : "Request could not be saved. Check database connectivity and input references.",
      },
      { status: 400 },
    );
  }
}
