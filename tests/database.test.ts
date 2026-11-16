import { describe, it, expect } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { sqlClient, closeDb, jsonParam } from "../packages/db/src/index";
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
          for (let i = 0; i < 2; i++) {
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
