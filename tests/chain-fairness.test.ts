import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { sqlClient, closeDb, jsonParam } from "../packages/db/src/index";
import { claimNextJob } from "../apps/worker/src/scheduler";

it.skipIf(!process.env.DATABASE_URL)(
  "gives due non-BSC chains turns through a large older BSC backlog and survives claim instances",
  async () => {
    const sql = sqlClient();
    let verified = false;
    try {
      await sql.begin(async (tx) => {
        const schema = "fair_" + randomUUID().replaceAll("-", "");
        await tx.unsafe(`CREATE SCHEMA ${schema}`);
        await tx.unsafe(`SET LOCAL search_path TO ${schema}`);
        for (const f of (await readdir("packages/db/migrations"))
          .filter((f) => f.endsWith(".sql"))
          .sort())
          await tx.unsafe(
            await readFile(`packages/db/migrations/${f}`, "utf8"),
          );
        const tokens = Array.from({ length: 55 }, (_, i) => ({
          id: i.toString(16).padStart(32, "0"),
          chain_id:
            i < 50 ? "56" : ["1", "8453", "42161", "CT_501", "146"][i - 50],
          contract: "0x" + (i + 1).toString(16).padStart(40, "0"),
          symbol: "FIXTURE",
          name: "Rollback fixture",
          token_id: String(i),
          status: "current",
          source: "synthetic-test-only",
          response_hash: "fixture",
          metadata: {},
        }));
        await tx`INSERT INTO alpha_tokens(id,chain_id,contract,symbol,name,token_id,status,source,response_hash,metadata,first_seen,last_seen) SELECT id,chain_id,contract,symbol,name,token_id,status,source,response_hash,metadata,now(),now() FROM jsonb_to_recordset(${jsonParam(tokens)}::jsonb) AS r(id text,chain_id text,contract text,symbol text,name text,token_id text,status text,source text,response_hash text,metadata jsonb)`;
        for (const t of tokens)
          await tx`INSERT INTO worker_jobs(key,kind,payload,run_after) VALUES(${"scan:" + t.id},'scan',${jsonParam({ tokenId: t.id, chainId: t.chain_id })}::jsonb,now()-(${t.chain_id === "56" ? 72 : 1}*interval '1 hour'))`;
        const client = {
          begin: (fn: (q: typeof tx) => Promise<unknown>) => tx.savepoint(fn),
        } as unknown as typeof sql;
        const seen = new Set<string>();
        for (let i = 0; i < 5; i++) {
          const job = await claimNextJob("fixture-owner", ["scan"], [], client);
          expect(job).not.toBeNull();
          seen.add(job!.payload.chainId);
        }
        expect([...seen].sort()).toEqual(
          ["1", "42161", "56", "8453", "CT_501"].sort(),
        );
        expect(
          (await tx`SELECT count(*)::int AS n FROM worker_chain_turns`)[0].n,
        ).toBe(5);
        await tx`INSERT INTO worker_provider_state(provider,blocked_until,reason) VALUES('rpc:56',now()+interval '1 day','PROVIDER_BUDGET_EXHAUSTED')`;
        // All other due jobs are leased; a blocked BSC provider and unsupported chain cannot dispatch.
        expect(
          await claimNextJob("new-owner", ["scan"], [], client),
        ).toBeNull();
        verified = true;
        throw Error("ROLLBACK_FAIR_FIXTURE");
      });
    } catch (e) {
      if (!(e instanceof Error) || e.message !== "ROLLBACK_FAIR_FIXTURE")
        throw e;
    } finally {
      await closeDb();
    }
    expect(verified).toBe(true);
  },
);
