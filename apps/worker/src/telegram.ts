import { z } from "zod";
import { config, HttpClient, explorerUrl, hashResponse } from "@flownix/core";
import { sqlClient, jsonParam, auditRequest } from "@flownix/db";
import { formatResearchNotification } from "../../../packages/core/src/notification-format";

const http = () =>
  new HttpClient("telegram", 20, auditRequest, undefined, undefined, 1);
function credentials() {
  const c = config();
  if (
    !c.TELEGRAM_BOT_TOKEN ||
    !c.TELEGRAM_CHAT_ID ||
    !/^[1-9][0-9]*$/.test(c.TELEGRAM_CHAT_ID)
  )
    throw Error("PRIVATE_TELEGRAM_CONFIGURATION_REQUIRED");
  return { token: c.TELEGRAM_BOT_TOKEN, chat: c.TELEGRAM_CHAT_ID };
}
const chatSchema = z.object({ id: z.number(), type: z.literal("private") });
export async function verifyPrivateDestination() {
  const { token, chat } = credentials();
  const client = http();
  const bot = await client.json(
    `https://api.telegram.org/bot${token}/getMe`,
    (b) =>
      z
        .object({
          ok: z.literal(true),
          result: z.object({ id: z.number(), is_bot: z.literal(true) }),
        })
        .parse(b),
  );
  const target = await client.json(
    `https://api.telegram.org/bot${token}/getChat`,
    (b) => z.object({ ok: z.literal(true), result: chatSchema }).parse(b),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat }),
    },
  );
  if (
    String(bot.data.result.id) !== token.split(":")[0] ||
    String(target.data.result.id) !== chat
  )
    throw Error("TELEGRAM_IDENTITY_MISMATCH");
  return hashResponse(`${bot.data.result.id}:${chat}`);
}

/** Owner shell only. Fixed UUID is the idempotency key, including after uncertainty. */
export async function enqueueTelegramTest(testId: string) {
  z.uuid().parse(testId);
  if (config().TELEGRAM_ENABLED) throw Error("DISABLE_GENUINE_TELEGRAM_FIRST");
  const destination = await verifyPrivateDestination();
  const id = `telegram-test:${testId}`;
  await sqlClient()`INSERT INTO notification_deliveries(id,channel,status,payload)
    VALUES(${id},'telegram','queued',${jsonParam({ test: true, explicit: true, destination, text: `FLOWNIX TEST ONLY\nApplication notification pipeline test ${testId}.\nNo research alert or trading action. Production notifications remain disabled.` })}::jsonb)
    ON CONFLICT(id) DO NOTHING`;
  return id;
}

/** Same delivery engine for explicit tests and ordinary scheduled notifications. */
export async function deliverNotifications(testId?: string) {
  const c = config(),
    sql = sqlClient();
  if (testId ? c.TELEGRAM_ENABLED : !c.TELEGRAM_ENABLED) return;
  const activation = !testId
    ? await sql`SELECT value FROM settings WHERE key='telegram_activation'`
    : [];
  const since = testId ? null : activation[0]?.value?.since;
  if (!testId && (!since || !Number.isFinite(Date.parse(since)))) return;
  const pending =
    await sql`SELECT id FROM notification_deliveries WHERE channel='telegram' AND status='queued' AND attempts=0
    AND CASE WHEN ${!!testId} THEN id=${testId ?? ""} ELSE coalesce(payload->>'test','false')<>'true' AND created_at>now()-interval '15 minutes' END LIMIT 1`;
  if (!pending.length) return;
  const destination = await verifyPrivateDestination();
  const { token, chat } = credentials();
  // Test calls can claim only their exact explicit row. Ordinary jobs cannot claim tests.
  const rows =
    await sql`UPDATE notification_deliveries SET status='sending',attempts=attempts+1
    WHERE id IN (SELECT id FROM notification_deliveries WHERE channel='telegram' AND status='queued'
      AND attempts=0 AND next_attempt_at<=now()
      AND CASE WHEN ${!!testId} THEN id=${testId ?? ""} AND payload->>'test'='true' AND payload->>'explicit'='true'
        AND payload->>'destination'=${destination}
        ELSE coalesce(payload->>'test','false')<>'true' AND created_at>now()-interval '15 minutes'
          AND EXISTS(SELECT 1 FROM signal_events s WHERE s.id=notification_deliveries.signal_id AND s.first_detected_at>=${since ?? "1970-01-01T00:00:00Z"}::timestamptz) END
      ORDER BY CASE WHEN payload->>'priority'='research_alert' THEN 0 ELSE 1 END,created_at FOR UPDATE SKIP LOCKED LIMIT ${testId ? 1 : 5}) RETURNING *`;
  for (const row of rows) {
    try {
      const response = await http().json(
        `https://api.telegram.org/bot${token}/sendMessage`,
        (b) =>
          z
            .object({
              ok: z.literal(true),
              result: z.object({
                message_id: z.number(),
                date: z.number(),
                chat: chatSchema,
              }),
            })
            .parse(b),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chat,
            text: String(row.payload.text).slice(0, 4000),
            link_preview_options: { is_disabled: true },
          }),
        },
      );
      if (String(response.data.result.chat.id) !== chat)
        throw Error("TELEGRAM_RESPONSE_TARGET_MISMATCH");
      const receipt = {
        ok: true,
        message_id: response.data.result.message_id,
        date: response.data.result.date,
        privateTargetMatches: true,
        responseHash: response.hash,
      };
      await sql`UPDATE notification_deliveries SET status='delivered',delivered_at=now(),receipt=${JSON.stringify(receipt)},error=null WHERE id=${row.id} AND status='sending'`;
    } catch {
      // Telegram has no sendMessage idempotency key. A timeout can mean delivered;
      // automatic retries would risk duplicates. Leave evidence for owner reconciliation.
      await sql`UPDATE notification_deliveries SET status='uncertain',error='DELIVERY_UNCONFIRMED_NO_AUTOMATIC_RETRY' WHERE id=${row.id} AND status='sending'`;
    }
  }
}

export async function queueResearchAlerts() {
  const c = config();
  if (!c.TELEGRAM_ENABLED) return;
  const sql = sqlClient();
  const activation =
    await sql`SELECT value FROM settings WHERE key='telegram_activation'`;
  const since = activation[0]?.value?.since;
  // Activation is an explicit owner operation after a delivered pipeline test.
  if (!since || !Number.isFinite(Date.parse(since))) return;
  const rows =
    await sql`SELECT s.*,t.symbol,t.chain_id,t.contract,t.research_state FROM signal_events s JOIN alpha_tokens t ON t.id=s.token_id
    WHERE s.status='active' AND s.first_detected_at>=${since}::timestamptz AND s.first_detected_at>now()-interval '15 minutes'
    AND s.evidence_confidence IN ('supported','high','provisional','limited')
    AND (${c.TELEGRAM_RESEARCH_DIGEST_ENABLED} OR s.evidence_confidence IN ('supported','high'))
    AND (${!c.TELEGRAM_WATCHLIST_ONLY} OR EXISTS(SELECT 1 FROM watchlists w WHERE w.token_id=t.id AND NOT w.archived))
    AND NOT EXISTS(SELECT 1 FROM notification_deliveries n WHERE n.signal_id=s.id AND n.channel='telegram') LIMIT 100`;
  for (const s of rows) {
    const evidence =
      await sql`SELECT e.*,coalesce(t.event_time,v.event_time) AS event_time,coalesce(t.available_at,v.available_at) AS available_at FROM signal_evidence e LEFT JOIN verified_swaps v ON v.chain_id=e.chain_id AND v.tx_hash=e.tx_hash AND v.log_index=e.log_index AND v.token_id=${s.token_id} AND v.canonical LEFT JOIN token_transfers t ON t.chain_id=e.chain_id AND t.tx_hash=e.tx_hash AND t.log_index=e.log_index AND t.token_id=${s.token_id} AND t.canonical WHERE e.signal_id=${s.id} LIMIT 3`;
    const text = formatResearchNotification(
      s,
      evidence.map((e) => ({
        eventTime: e.event_time,
        availableAt: e.available_at,
        url: explorerUrl(e.chain_id, "tx", e.tx_hash),
      })),
    );
    await sql`INSERT INTO notification_deliveries(id,signal_id,channel,status,payload) VALUES(${`telegram:${s.id}`},${s.id},'telegram','queued',${jsonParam({ text, priority: ["supported", "high"].includes(s.evidence_confidence) ? "research_alert" : "research_digest" })}::jsonb) ON CONFLICT(signal_id,channel) DO NOTHING`;
  }
}
