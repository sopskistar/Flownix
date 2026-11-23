import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { monitorWorker } from "../apps/worker/src/operations";
import { expect, it } from "vitest";
import {
  sqlClient,
  closeDb,
  reserveWorkerRequest,
  workerRequestPolicy,
} from "../packages/db/src/index";

it.skipIf(!process.env.DATABASE_URL)(
  "persists reservations across policy instances, rolls back partial charges, and defers only the failing provider",
  async () => {
    const sql = sqlClient();
    const prior = { ...process.env };
    let verified = false;
    try {
      process.env.ALCHEMY_DAILY_CU_LIMIT = "100";
      process.env.ALCHEMY_MONTHLY_CU_LIMIT = "150";
      process.env.ALCHEMY_MONTHLY_UNTRACKED_CU = "50";
      process.env.FUTURES_DAILY_REQUEST_LIMIT = "1";
      await sql.begin(async (tx) => {
        const schema = "budget_" + randomUUID().replaceAll("-", "");
        await tx.unsafe(`CREATE SCHEMA ${schema}`);
        await tx.unsafe(`SET LOCAL search_path TO ${schema}`);
        // The operations migration's indexes target existing base tables.
        await tx`CREATE TABLE worker_jobs(run_after timestamptz,kind text)`;
        await tx`CREATE TABLE provider_runs(started_at timestamptz)`;
        await tx.unsafe(
          await readFile(
            "packages/db/migrations/0014_worker_operations.sql",
            "utf8",
          ),
        );
        const client = Object.assign(tx, {
          begin: (fn: (sp: typeof tx) => Promise<unknown>) => tx.savepoint(fn),
        }) as unknown as typeof sql;
        const request = {
          provider: "rpc:56",
          alchemyRequests: 1,
          alchemyUnits: 60,
          unpriced: 0,
        };
        await workerRequestPolicy(client).reserve(request);
        await expect(
          workerRequestPolicy(client).reserve(request),
        ).rejects.toMatchObject({ code: "PROVIDER_BUDGET_EXHAUSTED" });
        const charged =
          await tx`SELECT scope,used::int FROM worker_budget_usage ORDER BY scope`;
        expect(charged).toEqual([
          { scope: "alchemy:day", used: 60 },
          { scope: "alchemy:month", used: 60 },
          { scope: "requests:rpc:56", used: 1 },
        ]);
        await expect(
          reserveWorkerRequest(request, client),
        ).rejects.toMatchObject({ code: "PROVIDER_DEFERRED" });
        await workerRequestPolicy(client).reserve({
          provider: "binance_alpha",
          alchemyRequests: 0,
          alchemyUnits: 0,
          unpriced: 0,
        });
        const futures = {
          provider: "binance_futures",
          alchemyRequests: 0,
          alchemyUnits: 0,
          unpriced: 0,
        };
        await workerRequestPolicy(client).reserve(futures);
        await expect(
          workerRequestPolicy(client).reserve(futures),
        ).rejects.toMatchObject({ code: "PROVIDER_BUDGET_EXHAUSTED" });
        expect(
          (
            await tx`SELECT used::int FROM worker_budget_usage WHERE scope='alchemy:day'`
          )[0].used,
        ).toBe(60);
        await workerRequestPolicy(client).complete({
          provider: "binance_futures:regional",
          at: new Date().toISOString(),
          status: 451,
          ok: false,
          error: "HTTP_451",
          latencyMs: 1,
        });
        await expect(
          workerRequestPolicy(client).reserve({
            ...futures,
            provider: "binance_futures:regional",
          }),
        ).rejects.toMatchObject({ code: "PROVIDER_DEFERRED" });

        await expect(
          reserveWorkerRequest(
            { ...request, provider: "rpc:1", unpriced: 1 },
            client,
          ),
        ).rejects.toMatchObject({ code: "ALCHEMY_UNPRICED_METHOD" });
        const policy = workerRequestPolicy(client);
        await policy.complete({
          provider: "rpc:cancelled",
          at: new Date().toISOString(),
          status: null,
          ok: false,
          error: "COLLECTION_STOPPED",
          latencyMs: 1,
        });
        expect(
          await tx`SELECT provider FROM worker_provider_state WHERE provider='rpc:cancelled'`,
        ).toHaveLength(0);
        await policy.complete({
          provider: "rpc:CT_501",
          at: new Date().toISOString(),
          status: 200,
          ok: false,
          error: "SOLANA_RPC_-32015",
          latencyMs: 1,
        });
        expect(
          await tx`SELECT provider FROM worker_provider_state WHERE provider='rpc:CT_501'`,
        ).toHaveLength(0);
        await policy.complete({
          provider: "rpc:1",
          at: new Date().toISOString(),
          status: 429,
          ok: false,
          error: "HTTP_429",
          latencyMs: 1,
          retryAfterSeconds: 300,
        });
        await expect(
          policy.reserve({ ...request, provider: "rpc:1" }),
        ).rejects.toMatchObject({ code: "PROVIDER_DEFERRED" });
        // UTC rollover does not reset the monthly allowance.
        const month = new Date();
        month.setUTCDate(2);
        month.setUTCHours(0, 0, 0, 0);
        await expect(
          reserveWorkerRequest(
            { ...request, provider: "rpc:8453" },
            client,
            month,
          ),
        ).rejects.toMatchObject({ code: "PROVIDER_BUDGET_EXHAUSTED" });
        process.env.ALCHEMY_ENRICHMENT_DAILY_CU_LIMIT = "5";
        const optional = {
          ...request,
          provider: "rpc:42161",
          alchemyUnits: 10,
          workload: "enrichment" as const,
        };
        await expect(
          workerRequestPolicy(client).reserve(optional),
        ).rejects.toMatchObject({ code: "WORKLOAD_BUDGET_EXHAUSTED" });
        expect(
          await tx`SELECT provider FROM worker_provider_state WHERE provider='rpc:42161'`,
        ).toHaveLength(0);
        await workerRequestPolicy(client).reserve({
          ...request,
          provider: "rpc:42161",
          alchemyUnits: 10,
        });
        expect(
          (
            await tx`SELECT used::int FROM worker_budget_usage WHERE scope='alchemy:day'`
          )[0].used,
        ).toBe(70);
        verified = true;
        throw Error("ROLLBACK_BUDGET_FIXTURE");
      });
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== "ROLLBACK_BUDGET_FIXTURE"
      )
        throw error;
    } finally {
      process.env = prior;
      await closeDb();
    }
    expect(verified).toBe(true);
  },
);

it.skipIf(!process.env.DATABASE_URL)(
  "deduplicates real operational alerts and resolves recovered conditions without market signals",
  async () => {
    const sql = sqlClient();
    let verified = false;
    try {
      await sql.begin(async (tx) => {
        const schema = "monitor_" + randomUUID().replaceAll("-", "");
        await tx.unsafe(`CREATE SCHEMA ${schema}`);
        await tx.unsafe(`SET LOCAL search_path TO ${schema}`);
        for (const name of (await readdir("packages/db/migrations"))
          .filter((n) => n.endsWith(".sql"))
          .sort())
          await tx.unsafe(
            await readFile(`packages/db/migrations/${name}`, "utf8"),
          );
        const client = Object.assign(tx, {
          begin: (fn: (sp: typeof tx) => Promise<unknown>) => tx.savepoint(fn),
        }) as unknown as typeof sql;
        expect((await monitorWorker(client)).activeAlerts).toContain(
          "registry_stale",
        );
        const count = (
          await tx`SELECT count(*)::int AS n FROM notification_deliveries`
        )[0].n;
        await tx`INSERT INTO settings(key,value) VALUES('registry_sync','{}')`;
        expect((await monitorWorker(client)).activeAlerts).not.toContain(
          "registry_stale",
        );
        expect(
          (await tx`SELECT count(*)::int AS n FROM notification_deliveries`)[0]
            .n,
        ).toBe(count);
        expect(
          (
            await tx`SELECT resolved_at FROM worker_operational_alerts WHERE code='registry_stale'`
          )[0].resolved_at,
        ).not.toBeNull();
        expect(
          (await tx`SELECT count(*)::int AS n FROM signal_events`)[0].n,
        ).toBe(0);
        verified = true;
        throw Error("ROLLBACK_MONITOR_FIXTURE");
      });
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== "ROLLBACK_MONITOR_FIXTURE"
      )
        throw error;
    } finally {
      await closeDb();
    }
    expect(verified).toBe(true);
  },
);
