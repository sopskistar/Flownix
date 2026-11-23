import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { sqlClient, closeDb } from "../packages/db/src/index";
import { tokenKey } from "../packages/core/src/identity";
import { graphResearchSync } from "../apps/worker/src/graph-research";

it.skipIf(!process.env.DATABASE_URL)(
  "materializes reproducible graph edges atomically and retires operational-wallet edges without deleting source history",
  async () => {
    const sql = sqlClient();
    let verified = false;
    try {
      await sql.begin(async (tx) => {
        const schema = "graph_" + randomUUID().replaceAll("-", "");
        await tx.unsafe(`CREATE SCHEMA ${schema}`);
        await tx.unsafe(`SET LOCAL search_path TO ${schema}`);
        for (const f of (await readdir("packages/db/migrations"))
          .filter((f) => f.endsWith(".sql"))
          .sort())
          await tx.unsafe(
            await readFile(`packages/db/migrations/${f}`, "utf8"),
          );
        const address = (n: number) => "0x" + n.toString(16).padStart(40, "0"),
          id = tokenKey("56", address(1));
        await tx`INSERT INTO alpha_tokens(id,chain_id,contract,symbol,name,token_id,status,first_seen,last_seen,source,response_hash,metadata) VALUES(${id},'56',${address(1)},'FIXTURE','Rollback only','1','current',now(),now(),'synthetic-test-only','fixture','{}')`;
        for (const n of [3, 4])
          await tx`INSERT INTO token_transfers(chain_id,tx_hash,log_index,token_id,block_number,block_hash,event_time,available_at,from_address,to_address,raw_quantity,decimals,kind,source) VALUES('56',${"0x" + n.toString(16).padStart(64, "0")},0,${id},100,${"0x" + "1".repeat(64)},now(),now(),${address(2)},${address(n)},'100',18,'unknown_transfer','synthetic-test-only')`;
        const client = Object.assign(tx, {
          begin: (fn: (sp: typeof tx) => Promise<unknown>) => tx.savepoint(fn),
        }) as unknown as typeof sql;
        expect(await graphResearchSync(client)).toEqual({
          connections: 1,
          externalRequests: 0,
        });
        const edge = (await tx`SELECT * FROM wallet_relationships`)[0];
        expect(edge.evidence.commonOwnership).toBe(false);
        expect(edge.evidence.txIds).toHaveLength(2);
        expect(await graphResearchSync(client)).toEqual({
          connections: 1,
          externalRequests: 0,
        });
        expect(await tx`SELECT id FROM wallet_relationships`).toHaveLength(1);
        await tx`INSERT INTO wallet_labels(chain_id,address,role,entity,source_url,confidence,valid_from,added_by,reviewed_by,notes) VALUES('56',${address(2)},'verified_exchange','Fixture venue','https://example.com/fixture-proof','reviewed source',now()-interval '1 day','fixture','fixture','Synthetic rollback fixture only')`;
        expect(await graphResearchSync(client)).toEqual({
          connections: 0,
          externalRequests: 0,
        });
        expect(await tx`SELECT id FROM wallet_relationships`).toHaveLength(0);
        expect(await tx`SELECT tx_hash FROM token_transfers`).toHaveLength(2);
        expect(
          await tx`SELECT feature_hash FROM research_feature_snapshots`,
        ).toHaveLength(2);
        verified = true;
        throw Error("ROLLBACK_GRAPH_FIXTURE");
      });
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== "ROLLBACK_GRAPH_FIXTURE"
      )
        throw error;
    } finally {
      await closeDb();
    }
    expect(verified).toBe(true);
  },
);
