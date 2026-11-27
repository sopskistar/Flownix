import {
  enqueueTelegramTest,
  deliverNotifications,
} from "../apps/worker/src/telegram";
import {
  sqlClient,
  closeDb,
  workerRequestPolicy,
} from "../packages/db/src/index";
import {
  installRequestPolicy,
  closeProviderNetwork,
} from "../packages/core/src/index";

async function readReceipt(id: string) {
  return sqlClient().begin("read only", async (tx) => {
    const [row] =
      await tx`SELECT id,status,attempts,delivered_at,receipt,error FROM notification_deliveries
        WHERE id=${id} AND channel='telegram' AND signal_id IS NULL
          AND payload->>'test'='true' AND payload->>'explicit'='true'`;
    return row ?? { id, status: "not_found" };
  });
}

const keep = setInterval(() => {}, 1000);
const [mode, uuid, confirmation, ...extra] = process.argv.slice(2);
try {
  const inspect = mode === "--status" && confirmation === undefined;
  const send =
    mode === "--send-one" && confirmation === "--confirm-private-target";
  if (
    (!inspect && !send) ||
    extra.length ||
    !uuid ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      uuid,
    )
  ) {
    console.error(
      "Usage: telegram-test.ts --status UUID | --send-one UUID --confirm-private-target (use a UUID from randomUUID())",
    );
    process.exitCode = 2;
  } else {
    process.env.DATABASE_URL =
      process.env.DATABASE_URL_WORKER ?? process.env.DATABASE_URL;
    const id = `telegram-test:${uuid}`;
    if (send) {
      installRequestPolicy(workerRequestPolicy());
      await enqueueTelegramTest(uuid);
      await deliverNotifications(id);
    }
    const result = await readReceipt(id);
    console.log(JSON.stringify(result));
    if (send && result.status !== "delivered") process.exitCode = 1;
  }
} catch {
  console.error(
    mode === "--status"
      ? "TELEGRAM_TEST_STATUS_UNAVAILABLE; check the worker database connection."
      : "TELEGRAM_TEST_NOT_CONFIRMED; use --status with the same UUID before considering any retry.",
  );
  process.exitCode = 1;
} finally {
  await closeDb();
  await closeProviderNetwork();
  clearInterval(keep);
}
