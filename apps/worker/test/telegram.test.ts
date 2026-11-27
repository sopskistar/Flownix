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
          (
            await tx`SELECT status FROM notification_deliveries WHERE id='historical'`
          )[0].status,
        ).toBe("queued");
        fixture.private = false;
        await expect(enqueueTelegramTest(randomUUID())).rejects.toBeDefined();
        fixture.private = true;
        fixture.fail = true;
        const uncertain = await enqueueTelegramTest(randomUUID());
        await deliverNotifications(uncertain);
        await deliverNotifications(uncertain);
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
      await db.closeDb();
    }
    expect(checked).toBe(true);
  },
);
