import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { sqlClient, closeDb } from "../packages/db/src/index";
import {
  reserveDutyCycle,
  finishDutyCycle,
} from "../apps/worker/src/duty-cycle";
it.skipIf(!process.env.DATABASE_URL)(
  "retains cycle debit and next wake across restarts and refuses a third over-budget allocation",
  async () => {
    const sql = sqlClient(),
      before = { ...process.env };
    let verified = false;
    try {
      process.env.WORKER_DUTY_ACTIVE_SECONDS = "600";
      process.env.WORKER_DUTY_INTERVAL_SECONDS = "21600";
      process.env.WORKER_DUTY_NEON_MAX_CU = "2";
      process.env.WORKER_DUTY_MONTHLY_CU_LIMIT = "1";
      await sql.begin(async (tx) => {
        const schema = "duty_" + randomUUID().replaceAll("-", "");
        await tx.unsafe(`CREATE SCHEMA ${schema}`);
        await tx.unsafe(`SET LOCAL search_path TO ${schema}`);
        for (const f of (await readdir("packages/db/migrations"))
          .filter((f) => f.endsWith(".sql"))
          .sort())
          await tx.unsafe(
            await readFile(`packages/db/migrations/${f}`, "utf8"),
          );
        await tx`INSERT INTO settings(key,value) VALUES('historical_sentinel','{"preserve":true}')`;
        const client = Object.assign(tx, {
          begin: (fn: (t: typeof tx) => Promise<unknown>) => tx.savepoint(fn),
          reserve: async () => Object.assign(tx, { release: () => {} }),
        }) as unknown as typeof sql;
        await expect(
          reserveDutyCycle(client, () => {
            throw Error("CONFIGURATION_BLOCKED");
          }),
        ).rejects.toThrow("CONFIGURATION_BLOCKED");
        expect(
          (await tx`SELECT count(*)::int AS n FROM worker_budget_usage`)[0].n,
        ).toBe(0);
        const first = await reserveDutyCycle(client);
        expect(first).toMatchObject({ run: true });
        expect((await reserveDutyCycle(client)).run).toBe(false);
        await finishDutyCycle(first.owner!, 1, client);
        expect(
          (
            await tx`SELECT value FROM settings WHERE key='worker_duty_cycle'`
          )[0].value,
        ).toMatchObject({
          lastExitCode: 1,
          nextAt: first.nextAt,
          phase: "degraded_idle",
        });
        await tx`UPDATE settings SET value=jsonb_set(value,'{nextAt}',to_jsonb((now()-interval '1 second')::text)) WHERE key='worker_duty_cycle'`;
        expect((await reserveDutyCycle(client)).run).toBe(true);
        await tx`UPDATE settings SET value=jsonb_set(value,'{nextAt}',to_jsonb((now()-interval '1 second')::text)) WHERE key='worker_duty_cycle'`;
        expect(await reserveDutyCycle(client)).toMatchObject({
          run: false,
          reason: "budget_exhausted",
        });
        expect(
          (await tx`SELECT used::int FROM worker_budget_usage`)[0].used,
        ).toBe(1000000);
        expect(
          (
            await tx`SELECT detail FROM worker_operational_alerts WHERE code='neon_worker_model_budget'`
          )[0].detail.accountUsageMeasured,
        ).toBe(false);
        expect(
          (
            await tx`SELECT value FROM settings WHERE key='historical_sentinel'`
          )[0].value,
        ).toEqual({ preserve: true });
        verified = true;
        throw Error("ROLLBACK_DUTY_FIXTURE");
      });
    } catch (e) {
      if (!(e instanceof Error) || e.message !== "ROLLBACK_DUTY_FIXTURE")
        throw e;
    } finally {
      process.env = before;
      await closeDb();
    }
    expect(verified).toBe(true);
  },
);
it.skipIf(!process.env.DATABASE_URL)(
  "scheduled idle closes every duty database connection and survives SIGTERM/restart without spending another cycle",
  async () => {
    const url = process.env.DATABASE_URL!;
    if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
      throw Error("LOCAL_FIXTURE_ONLY");
    const sql = sqlClient(),
      original = (
        await sql`SELECT value FROM settings WHERE key='worker_duty_cycle'`
      )[0]?.value;
    const nextAt = new Date(Date.now() + 30 * 86400000).toISOString(),
      marker = randomUUID();
    let child: ReturnType<typeof spawn> | undefined;
    try {
      await sql`INSERT INTO settings(key,value) VALUES('worker_duty_cycle',${sql.json({ nextAt, owner: marker })}) ON CONFLICT(key) DO UPDATE SET value=excluded.value`;
      for (let run = 0; run < 2; run++) {
        child = spawn(
          process.execPath,
          ["--import", "tsx", "scripts/worker-duty.ts"],
          {
            env: {
              ...process.env,
              DATABASE_URL: url,
              DATABASE_URL_WORKER: url,
              PROVIDER_DNS_SERVERS: "",
              WORKER_EXECUTION_MODE: "duty_cycle",
            },
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        const p = child;
        let output = "";
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(
            () => reject(Error("DUTY_IDLE_NOT_REACHED")),
            15000,
          );
          p.stdout!.on("data", (d) => {
            output += d.toString();
            if (output.includes("duty_reservation")) {
              clearTimeout(t);
              resolve();
            }
          });
          p.once("exit", () => {
            clearTimeout(t);
            reject(Error("DUTY_PROCESS_EXITED"));
          });
        });
        await new Promise((r) => setTimeout(r, 250));
        expect(output.match(/duty_reservation/g)?.length).toBe(1);
        // The observer also identifies as flownix-duty when checking a real
        // budget environment; count only other database sessions.
        expect(
          (
            await sql`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND application_name='flownix-duty' AND pid<>pg_backend_pid()`
          )[0].n,
        ).toBe(0);
        const health = JSON.parse(
          await readFile("/tmp/flownix-worker-health.json", "utf8"),
        );
        expect(health).toMatchObject({
          supervisor: true,
          phase: "sleeping",
          nextAt,
        });
        const exit = once(p, "exit");
        p.kill("SIGTERM");
        await exit;
        child = undefined;
        expect(
          (
            await sql`SELECT value FROM settings WHERE key='worker_duty_cycle'`
          )[0].value,
        ).toEqual({ nextAt, owner: marker });
      }
    } finally {
      child?.kill("SIGKILL");
      if (original)
        await sql`UPDATE settings SET value=${sql.json(original)} WHERE key='worker_duty_cycle'`;
      else
        await sql`DELETE FROM settings WHERE key='worker_duty_cycle' AND value->>'owner'=${marker}`;
      await closeDb();
    }
  },
  40000,
);
