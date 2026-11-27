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
const keep = setInterval(() => {}, 1000);
try {
  const args = process.argv.slice(2);
  if (
    args.length !== 3 ||
    args[0] !== "--send-one" ||
    args[2] !== "--confirm-private-target"
  )
    throw Error("EXPLICIT_OWNER_COMMAND_REQUIRED");
  process.env.DATABASE_URL =
    process.env.DATABASE_URL_WORKER ?? process.env.DATABASE_URL;
  installRequestPolicy(workerRequestPolicy());
  const id = await enqueueTelegramTest(args[1]);
  await deliverNotifications(id);
  const rows =
    await sqlClient()`SELECT id,status,attempts,delivered_at,receipt,error FROM notification_deliveries WHERE id=${id}`;
  console.log(JSON.stringify(rows[0]));
  if (rows[0]?.status !== "delivered") process.exitCode = 1;
} catch {
  console.error(
    "TELEGRAM_TEST_NOT_CONFIRMED; inspect the delivery row, never retry with a new ID after uncertainty.",
  );
  process.exitCode = 1;
} finally {
  await closeDb();
  await closeProviderNetwork();
  clearInterval(keep);
}
