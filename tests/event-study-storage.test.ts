import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { sqlClient, closeDb } from "../packages/db/src/index";
import {
  persistListingStudy,
  persistHistoricalStudy,
} from "../apps/worker/src/listing-storage";
it.skipIf(!process.env.DATABASE_URL)(
  "preserves immutable event studies and existing case annotations atomically",
  async () => {
    const sql = sqlClient();
    let verified = false;
    try {
      await sql.begin(async (tx) => {
        const schema = "events_" + randomUUID().replaceAll("-", "");
        await tx.unsafe(`CREATE SCHEMA ${schema}`);
        await tx.unsafe(`SET LOCAL search_path TO ${schema}`);
        for (const f of (await readdir("packages/db/migrations"))
          .filter((f) => f.endsWith(".sql"))
          .sort())
          await tx.unsafe(
            await readFile(`packages/db/migrations/${f}`, "utf8"),
          );
        const id = "a".repeat(32),
          hash = "b".repeat(64);
        await tx`INSERT INTO alpha_tokens(id,chain_id,contract,symbol,name,token_id,status,first_seen,last_seen,source,response_hash,metadata) VALUES(${id},'56',${"0x" + "1".repeat(40)},'FIXTURE','Rollback only','1','current',now(),now(),'synthetic-only','fixture','{}')`;
        await tx`INSERT INTO research_case_candidates(token_id,source,observed_at,hypothesis,evidence) VALUES(${id},'fixture',now(),'Original hypothesis','{"originalAnnotation":"preserve","runnerClassificationVerified":true}')`;
        const client = Object.assign(tx, {
          begin: (fn: (sp: typeof tx) => Promise<unknown>) => tx.savepoint(fn),
        }) as unknown as typeof sql;
        await persistListingStudy(
          {
            tokenId: id,
            runHash: hash,
            manifest: { event: { tokenId: id } },
            report: { original: true },
          },
          client,
        );
        await persistListingStudy(
          {
            tokenId: id,
            runHash: hash,
            manifest: {},
            report: { original: false },
          },
          client,
        );
        expect(
          (await tx`SELECT report FROM event_study_runs`)[0].report,
        ).toEqual({ original: true });
        expect(
          (
            await tx`SELECT evidence,hypothesis FROM research_case_candidates`
          )[0],
        ).toMatchObject({
          evidence: {
            originalAnnotation: "preserve",
            eventStudyRun: hash,
            runnerClassificationVerified: true,
          },
          hypothesis: "Original hypothesis",
        });
        const historicalHash = "c".repeat(64);
        await persistHistoricalStudy(
          {
            runHash: historicalHash,
            manifest: { fixed: true },
            report: { episodes: [], censored: true },
            tokenIds: [id],
          },
          client,
        );
        await persistHistoricalStudy(
          {
            runHash: historicalHash,
            manifest: {},
            report: { overwritten: true },
            tokenIds: [id],
          },
          client,
        );
        expect(
          (
            await tx`SELECT report FROM event_study_runs WHERE run_hash=${historicalHash}`
          )[0].report,
        ).toEqual({ episodes: [], censored: true });
        expect(
          (
            await tx`SELECT evidence,hypothesis FROM research_case_candidates`
          )[0],
        ).toMatchObject({
          evidence: {
            originalAnnotation: "preserve",
            eventStudyRun: hash,
            historicalRun: historicalHash,
            runnerClassificationVerified: true,
          },
          hypothesis: "Original hypothesis",
        });
        verified = true;
        throw Error("ROLLBACK_EVENT_FIXTURE");
      });
    } catch (e) {
      if (!(e instanceof Error) || e.message !== "ROLLBACK_EVENT_FIXTURE")
        throw e;
    } finally {
      await closeDb();
    }
    expect(verified).toBe(true);
  },
);
