import { it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
const fixture = vi.hoisted(() => ({
  client: undefined as
    ReturnType<typeof import("@flownix/db").sqlClient> | undefined,
  sends: 0,
  fail: false,
  private: true,
  enabled: false,
  digest: false,
}));
vi.mock("@flownix/db", async (original) => ({
  ...(await original<typeof import("@flownix/db")>()),
  sqlClient: () => {
    if (!fixture.client) throw Error("SCOPED_DB_REQUIRED");
    return fixture.client;
  },
}));
vi.mock("@flownix/core", async (original) => {
  const core = await original<typeof import("@flownix/core")>();
  return {
    ...core,
    config: () => ({
      ...core.config(),
      TELEGRAM_ENABLED: fixture.enabled,
      TELEGRAM_RESEARCH_DIGEST_ENABLED: fixture.digest,
      TELEGRAM_BOT_TOKEN: "123:synthetic-test-only",
      TELEGRAM_CHAT_ID: "456",
    }),
    HttpClient: class {
      async json(url: string, parse: (b: unknown) => unknown) {
        if (url.endsWith("/sendMessage")) {
          fixture.sends++;
          if (fixture.fail) throw Error("AMBIGUOUS_TIMEOUT");
        }
        const result = url.endsWith("/getMe")
          ? { id: 123, is_bot: true }
          : url.endsWith("/getChat")
            ? { id: 456, type: fixture.private ? "private" : "group" }
            : {
                message_id: 789,
                date: 1795720000,
                chat: { id: 456, type: "private" },
              };
        return {
          data: parse({ ok: true, result }),
          hash: "synthetic-response-hash",
        };
      }
    },
  };
});
import {
  enqueueTelegramTest,
  deliverNotifications,
  queueResearchAlerts,
} from "../src/telegram";

it.skipIf(!process.env.DATABASE_URL)(
  "isolates one explicit test from backlog and production, preserves receipts and never repeats uncertain sends",
  async () => {
    const db =
      await vi.importActual<typeof import("@flownix/db")>("@flownix/db");
    const sql = db.sqlClient();
    let checked = false;
    try {
      await sql.begin(async (tx) => {
        const schema = "tg_" + randomUUID().replaceAll("-", "");
        await tx.unsafe(`CREATE SCHEMA ${schema}`);
        await tx.unsafe(`SET LOCAL search_path TO ${schema}`);
        for (const file of (await readdir("packages/db/migrations"))
          .filter((f) => f.endsWith(".sql"))
          .sort())
          await tx.unsafe(
            await readFile(`packages/db/migrations/${file}`, "utf8"),
          );
        fixture.client = tx as unknown as typeof sql;
        await tx`INSERT INTO notification_deliveries(id,channel,status,payload) VALUES('historical','telegram','queued','{"text":"must not send"}')`;
        await tx`UPDATE notification_deliveries SET created_at=now()-interval '1 day' WHERE id='historical'`;
        await tx`INSERT INTO notification_deliveries(id,channel,status,payload) VALUES('genuine','telegram','queued','{"text":"genuine research alert"}')`;
        await deliverNotifications();
        await queueResearchAlerts();
        expect(fixture.sends).toBe(0);
        const uuid = randomUUID();
        const id = await enqueueTelegramTest(uuid);
        await deliverNotifications(id);
        await enqueueTelegramTest(uuid);
        await deliverNotifications(id);
        expect(fixture.sends).toBe(1);
        const [row] =
          await tx`SELECT * FROM notification_deliveries WHERE id=${id}`;
        expect(row.status).toBe("delivered");
        expect(row.attempts).toBe(1);
        expect(JSON.parse(row.receipt)).toMatchObject({
          ok: true,
          message_id: 789,
          privateTargetMatches: true,
        });
        expect(
          await tx`SELECT id,status,attempts FROM notification_deliveries WHERE id IN ('genuine','historical') ORDER BY id`,
        ).toEqual([
          { id: "genuine", status: "queued", attempts: 0 },
          { id: "historical", status: "queued", attempts: 0 },
        ]);
        fixture.private = false;
        await expect(enqueueTelegramTest(randomUUID())).rejects.toBeDefined();
        fixture.private = true;
        fixture.fail = true;
        const uncertain = await enqueueTelegramTest(randomUUID());
        await deliverNotifications(uncertain);
        await deliverNotifications(uncertain);
        expect(fixture.sends).toBe(2);
        const interrupted = await enqueueTelegramTest(randomUUID());
        await tx`UPDATE notification_deliveries SET status='sending',attempts=1 WHERE id=${interrupted}`;
        await deliverNotifications(interrupted);
        expect(fixture.sends).toBe(2);
        expect(
          (
            await tx`SELECT status FROM notification_deliveries WHERE id=${uncertain}`
          )[0].status,
        ).toBe("uncertain");
        fixture.enabled = true;
        await expect(enqueueTelegramTest(randomUUID())).rejects.toThrow(
          "DISABLE_GENUINE",
        );
        fixture.digest = true;
        const tokenId = randomUUID().replaceAll("-", ""),
          signalId = randomUUID(),
          contract = "0x" + "1".repeat(40),
          wallet = "0x" + "2".repeat(40),
          txHash = "0x" + "3".repeat(64);
        await tx`INSERT INTO alpha_tokens(id,chain_id,contract,symbol,name,token_id,status,first_seen,last_seen,source,response_hash,metadata) VALUES(${tokenId},'56',${contract},'TG_FIXTURE','Synthetic label regression',${tokenId},'current',now(),now(),'synthetic-test-only','fixture','{}')`;
        await tx`INSERT INTO signal_events(id,token_id,kind,rule_version,stage,first_detected_at,computed_at,data_available_at,evidence_confidence,thresholds,observed,counter_evidence,message) VALUES(${signalId},${tokenId},'UNUSUAL_TRANSFER_ACTIVITY','fixture','INVESTIGATE',now(),now(),now(),'limited','{}','{}','[]','Synthetic test only; not a production finding')`;
        await tx`INSERT INTO token_transfers(chain_id,tx_hash,log_index,token_id,block_number,block_hash,event_time,available_at,from_address,to_address,raw_quantity,decimals,kind,source) VALUES('56',${txHash},0,${tokenId},100,${txHash},now()-interval '2 minutes',now()-interval '1 minute',${wallet},${contract},1,18,'unknown_transfer','synthetic-test-only')`;
        await tx`INSERT INTO signal_evidence(signal_id,chain_id,tx_hash,log_index) VALUES(${signalId},'56',${txHash},0)`;
        for (const future of [false, true])
          await tx`INSERT INTO wallet_labels(chain_id,address,role,entity,source_url,confidence,valid_from,added_by,reviewed_by,notes,created_at) VALUES('56',${wallet},'possible_exchange',${future ? "FUTURE_LABEL_MUST_NOT_LEAK" : "Known label claim"},'https://example.com/synthetic-only','third_party_reviewed',now()-interval '1 day','fixture','fixture','Synthetic rollback-only test',now()+(${future ? 86400 : -600}*interval '1 second'))`;
        await tx`INSERT INTO settings(key,value) VALUES('telegram_activation',jsonb_build_object('since',now()-interval '10 minutes','acceptedTestId',${id}::text))`;
        await queueResearchAlerts();
        const [digest] =
          await tx`SELECT payload FROM notification_deliveries WHERE signal_id=${signalId} AND channel='telegram'`;
        expect(digest.payload.priority).toBe("research_digest");
        expect(digest.payload.text).toContain("Known label claim");
        expect(digest.payload.text).toContain("third_party_reviewed");
        expect(digest.payload.text).not.toContain("FUTURE_LABEL_MUST_NOT_LEAK");
        expect(digest.payload.text).toContain(
          "ownership and intent are unknown",
        );
        expect(fixture.sends).toBe(2);
        fixture.digest = false;
        fixture.enabled = false;
        checked = true;
        throw Error("ROLLBACK_TELEGRAM_FIXTURE");
      });
    } catch (e) {
      if (!(e instanceof Error) || e.message !== "ROLLBACK_TELEGRAM_FIXTURE")
        throw e;
    } finally {
      fixture.client = undefined;
      fixture.fail = false;
      fixture.enabled = false;
      fixture.digest = false;
      await db.closeDb();
    }
    expect(checked).toBe(true);
  },
);
