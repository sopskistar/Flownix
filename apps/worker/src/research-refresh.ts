import { walletResearchSync } from "./wallet-research";
import { graphResearchSync } from "./graph-research";
import { sqlClient, closeDb } from "@flownix/db";
import { closeProviderNetwork, networkErrorCode } from "@flownix/core";
process.env.DATABASE_URL =
  process.env.DATABASE_URL_WORKER ?? process.env.DATABASE_URL;
const keepAlive = setInterval(() => {}, 1000);
async function main() {
  const lock = await sqlClient().reserve();
  try {
    if (
      !(await lock`SELECT pg_try_advisory_lock(726032) AS acquired`)[0].acquired
    )
      throw Error("COLLECTOR_BUSY");
    await graphResearchSync();
    await walletResearchSync();
    console.log(
      JSON.stringify({
        researchRefresh: true,
        source: "Persisted canonical observations only",
        externalRequests: 0,
      }),
    );
  } finally {
    await lock`SELECT pg_advisory_unlock(726032)`;
    lock.release();
  }
}
main()
  .catch((e) => {
    console.error(networkErrorCode(e));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
    await closeProviderNetwork();
    clearInterval(keepAlive);
  });
