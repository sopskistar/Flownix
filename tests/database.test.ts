import { describe, it, expect } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { claimNextJob } from "../apps/worker/src/scheduler";
import {
  sqlClient,
  closeDb,
  jsonParam,
  database,
} from "../packages/db/src/index";
const enabled = !!process.env.DATABASE_URL;
describe.skipIf(!enabled)(
  "Postgres transaction/reorg evidence integration — isolated rollback schema",
  () => {
    it("migrates, deduplicates logs, resumes cursors and preserves removed membership", async () => {
      const sql = sqlClient(),
        schema = "test_" + randomUUID().replaceAll("-", "");
      let checked = false;
      try {
        await sql.begin(async (tx) => {
          await tx.unsafe(`CREATE SCHEMA ${schema}`);
          await tx.unsafe(`SET LOCAL search_path TO ${schema}`);
          for (const name of (await readdir("packages/db/migrations"))
            .filter((s) => s.endsWith(".sql"))
            .sort())
            await tx.unsafe(
              await readFile("packages/db/migrations/" + name, "utf8"),
            );
          const covered =
            await tx`SELECT sum(extract(epoch FROM upper(period)-lower(period)))::int AS seconds FROM unnest((SELECT range_agg(r) FROM (VALUES (tstzrange('2026-01-01T00:00:00Z','2026-01-01T00:01:00Z','[)')),(tstzrange('2026-01-01T00:00:30Z','2026-01-01T00:01:30Z','[)')),(tstzrange('2026-01-01T00:02:00Z','2026-01-01T00:02:30Z','[)'))) AS ranges(r))) AS period`;
          expect(covered[0].seconds).toBe(120); // Gaps and overlapping replay do not create extra history.
          const id = "a".repeat(32),
            address = "0x" + "1".repeat(40),
            hash = "0x" + "2".repeat(64);
          await tx`INSERT INTO alpha_tokens(id,chain_id,contract,symbol,name,token_id,alpha_id,status,first_seen,last_seen,source,response_hash,metadata) VALUES(${id},'56',${address},'SYNTHETIC','Rollback-only fixture','opaque','ALPHA_999','current',now(),now(),'synthetic-test-only',${hash},'{}')`;
          for (let i = 0; i < 2; i++)
            await tx`INSERT INTO token_transfers(chain_id,tx_hash,log_index,token_id,block_number,block_hash,event_time,available_at,from_address,to_address,raw_quantity,decimals,kind,source) VALUES('56',${hash},0,${id},100,${hash},now(),now(),${address},${address},'1000000000000000000000000000001',18,'self_transfer','synthetic-test-only') ON CONFLICT DO NOTHING`;
          expect(
            (await tx`SELECT count(*)::int AS n FROM token_transfers`)[0].n,
          ).toBe(1);
          await tx`INSERT INTO block_cursors(token_id,chain_id,block_number,block_hash,scanned_at) VALUES(${id},'56',100,${hash},now())`;
          expect(
            (
              await tx`SELECT block_number::text AS n FROM block_cursors WHERE token_id=${id}`
            )[0].n,
          ).toBe("100");
          await tx`UPDATE token_transfers SET canonical=false WHERE token_id=${id}`;
          expect(
            (
              await tx`SELECT count(*)::int AS n FROM token_transfers WHERE canonical`
            )[0].n,
          ).toBe(0);
          await tx`UPDATE alpha_tokens SET status='removed' WHERE id=${id}`;
          expect(
            (await tx`SELECT status FROM alpha_tokens WHERE id=${id}`)[0]
              .status,
          ).toBe("removed");
          const universe = Array.from({ length: 251 }, (_, i) => ({
            id: i.toString(16).padStart(32, "0"),
            chain_id: "56",
            contract: "0x" + (i + 1000).toString(16).padStart(40, "0"),
            symbol: `A${i}`,
            name: `Alpha fixture ${i}`,
            token_id: `opaque-${i}`,
            alpha_id: `ALPHA_${i}`,
            status: "current",
            first_seen: new Date().toISOString(),
            last_seen: new Date().toISOString(),
            source: "synthetic-test-only",
            response_hash: hash,
            metadata: {},
          }));
          await tx`INSERT INTO alpha_tokens(id,chain_id,contract,symbol,name,token_id,alpha_id,status,first_seen,last_seen,source,response_hash,metadata) SELECT id,chain_id,contract,symbol,name,token_id,alpha_id,status,first_seen,last_seen,source,response_hash,metadata FROM jsonb_to_recordset(${jsonParam(universe)}::jsonb) AS r(id text,chain_id text,contract text,symbol text,name text,token_id text,alpha_id text,status text,first_seen timestamptz,last_seen timestamptz,source text,response_hash text,metadata jsonb)`;
          const scanJobs = universe.map((t) => ({
            key: `scan:${t.id}`,
            kind: "scan",
            payload: { tokenId: t.id, chainId: t.chain_id },
          }));
          await tx`INSERT INTO worker_jobs(key,kind,payload) SELECT key,kind,payload FROM jsonb_to_recordset(${jsonParam(scanJobs)}::jsonb) AS r(key text,kind text,payload jsonb)`;
          let visited = 0;
          while (true) {
            const batch =
              await tx`SELECT key FROM worker_jobs WHERE kind='scan' AND run_after<=now() ORDER BY run_after,key LIMIT 100 FOR UPDATE`;
            if (!batch.length) break;
            visited += batch.length;
            const keys = batch.map((r) => r.key);
            await tx`UPDATE worker_jobs SET run_after=now()+interval '1 day',status='done' WHERE key=ANY(${keys})`;
          }
          expect(visited).toBe(251); // More than two batches; no permanent universe cap.
          // Exercise the actual collector claim query, including an explicit
          // scan turn while market work is queued, lease recovery and admission.
          const keys = universe.slice(0, 4).map((t) => `scan:${t.id}`);
          await tx`UPDATE worker_jobs SET status='queued',run_after=now()-interval '1 hour' WHERE key=ANY(${keys})`;
          await tx`UPDATE worker_jobs SET status='running',lease_until=now()+interval '2 minutes' WHERE key=${keys[0]}`;
          await tx`UPDATE worker_jobs SET status='running',lease_until=now()-interval '1 second' WHERE key=${keys[1]}`;
          await tx`UPDATE worker_jobs SET status='retry',attempts=2 WHERE key=${keys[2]}`;
          await tx`UPDATE alpha_tokens SET status='offline' WHERE id=${universe[3].id}`;
          await tx`INSERT INTO worker_jobs(key,kind) VALUES('market','market')`;
          const claimClient = {
            begin: (fn: (sp: typeof tx) => Promise<unknown>) =>
              tx.savepoint(fn),
          } as unknown as ReturnType<typeof sqlClient>;
          const owner = randomUUID();
          expect(
            (await claimNextJob(owner, ["market", "scan"], [], claimClient))
              ?.key,
          ).toBe("market");
          expect(
            await claimNextJob(
              owner,
              ["scan"],
              [],
              claimClient,
              false,
              "scan:missing-diagnostic-key",
            ),
          ).toBeNull();
          expect(
            (await claimNextJob(owner, ["scan"], [], claimClient, true))?.key,
          ).toBe(keys[2]);
          expect(
            (await claimNextJob(owner, ["scan"], [], claimClient))?.key,
          ).toBe(keys[1]);
          expect(
            await claimNextJob(owner, ["scan"], [], claimClient),
          ).toBeNull();
          expect(
            (await tx`SELECT owner FROM worker_jobs WHERE key=${keys[1]}`)[0]
              .owner,
          ).toBe(owner);
          for (let i = 0; i < 2; i++) {
            // ORM construction must not mutate the raw client's JSON serializers.
            database();
            await tx`INSERT INTO notification_deliveries(id,channel,status,payload) VALUES(${randomUUID()},'in_app','delivered',${jsonParam({ test: true, text: "Synthetic JSONB regression, isolated rollback only", nested: { count: i } })})`;
          }
          const payloads =
            await tx`SELECT jsonb_typeof(payload) AS kind,payload->>'text' AS text,payload FROM notification_deliveries`;
          expect(payloads).toHaveLength(2);
          expect(
            payloads.every(
              (p) =>
                p.kind === "object" &&
                p.text === "Synthetic JSONB regression, isolated rollback only",
            ),
          ).toBe(true);
          expect(payloads.map((p) => p.payload.nested.count)).toEqual([0, 1]);
          checked = true;
          throw Error("ROLLBACK_TEST_SCHEMA");
        });
      } catch (e) {
        if (!(e instanceof Error) || e.message !== "ROLLBACK_TEST_SCHEMA")
          throw e;
      } finally {
        await closeDb();
      }
      expect(checked).toBe(true);
    });
  },
);
