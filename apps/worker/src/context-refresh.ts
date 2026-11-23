import { graphResearchSync } from "./graph-research";
import { derivativesSync } from "./derivatives";
import { sqlClient, closeDb, workerRequestPolicy } from "@flownix/db";
import {
  networkErrorCode,
  installRequestPolicy,
  closeProviderNetwork,
} from "@flownix/core";
process.env.DATABASE_URL =
  process.env.DATABASE_URL_WORKER ?? process.env.DATABASE_URL;
const timer = setInterval(() => {}, 1000);
async function main() {
  installRequestPolicy(workerRequestPolicy());
  const lock = await sqlClient().reserve();
  let acquired = false;
  try {
    acquired = (await lock`SELECT pg_try_advisory_lock(726032) AS acquired`)[0]
      .acquired;
    if (!acquired) throw Error("COLLECTOR_BUSY");
    console.log(
      JSON.stringify(
        await (process.argv.includes("--derivatives")
          ? derivativesSync()
          : graphResearchSync()),
      ),
    );
  } finally {
    if (acquired) await lock`SELECT pg_advisory_unlock(726032)`;
    lock.release();
  }
}
main()
  .catch((error) => {
    console.error(networkErrorCode(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
    await closeProviderNetwork();
    clearInterval(timer);
  });
