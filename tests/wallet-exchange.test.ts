import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import {
  tokenKey,
  exchangeLabelFromRow,
  walletExchangeResearch,
} from "../packages/core/src/index";
import {
  sqlClient,
  closeDb,
  ensureWalletMonitoring,
  appendWalletLabel,
  type WalletLabelAssertion,
} from "../packages/db/src/index";
it.skipIf(!process.env.DATABASE_URL)(
  "registers missing exact-identity monitors idempotently and appends conflicting label versions without rewriting history",
  async () => {
    const sql = sqlClient();
    let verified = false;
    try {
      await sql.begin(async (tx) => {
        const schema = "wallet_case_" + randomUUID().replaceAll("-", "");
        await tx.unsafe(`CREATE SCHEMA ${schema}`);
        await tx.unsafe(`SET LOCAL search_path TO ${schema}`);
        for (const f of (await readdir("packages/db/migrations"))
          .filter((f) => f.endsWith(".sql"))
          .sort())
          await tx.unsafe(
            await readFile("packages/db/migrations/" + f, "utf8"),
          );
        const contract = "0x" + "1".repeat(40),
          wallet = "0x" + "2".repeat(40),
          id = tokenKey("56", contract),
          token = { id, chain: "56", contract };
        await tx`INSERT INTO alpha_tokens(id,chain_id,contract,symbol,name,token_id,status,first_seen,last_seen,source,response_hash,metadata) VALUES(${id},'56',${contract},'SAME','Local fixture','fixture','current',now(),now(),'fixture','fixture','{}')`;
        const client = Object.assign(tx, {
          begin: (fn: (q: typeof tx) => Promise<unknown>) => tx.savepoint(fn),
        }) as unknown as typeof sql;
        await expect(
          ensureWalletMonitoring(
            { ...token, chain: "1" },
            wallet,
            "fixture",
            client,
          ),
        ).rejects.toThrow("EXACT_ALPHA");
        const missing = { id: tokenKey("1", contract), chain: "1", contract };
        await expect(
          ensureWalletMonitoring(missing, wallet, "fixture", client),
        ).rejects.toThrow("CURRENT_OFFICIAL");
        for (let i = 0; i < 2; i++)
          await ensureWalletMonitoring(
            token,
            wallet,
            "Owner investigation; identity unknown",
            client,
          );
        expect(
          (await tx`SELECT count(*)::int AS n FROM wallet_monitoring`)[0].n,
        ).toBe(1);
        expect(
          (await tx`SELECT deep_selected FROM alpha_tokens WHERE id=${id}`)[0]
            .deep_selected,
        ).toBe(false);
        const a: WalletLabelAssertion = {
          chain: "56",
          address: wallet,
          entity: "Exchange",
          role: "verified_exchange",
          sourceUrl: "https://fixture.invalid/official",
          confidence: "Exchange-published address",
          validFrom: "2026-01-01T00:00:00Z",
          validTo: null,
          reviewedBy: "fixture-review",
          detail: {
            version: "exchange-address/1",
            accountRole: "operational",
            basis: "exchange_published_address",
            publishedAt: "2026-01-01T00:00:00Z",
            notes: "Fixture only",
            contradictions: [],
          },
        };
        const first = await appendWalletLabel(a, client);
        expect(first.inserted).toBe(true);
        expect((await appendWalletLabel(a, client)).inserted).toBe(false);
        await expect(
          appendWalletLabel({ ...a, reviewedBy: null }, client),
        ).rejects.toThrow("INVALID_LABEL");
        await appendWalletLabel(
          {
            ...a,
            entity: "Conflicting Exchange",
            detail: { ...a.detail, notes: "Conflicting later source" },
          },
          client,
        );
        const labels = await tx`SELECT * FROM wallet_labels ORDER BY id`;
        expect(labels).toHaveLength(2);
        expect(labels[0].entity).toBe("Exchange");
        const mapped = labels.map(exchangeLabelFromRow);
        expect(mapped.every((l) => l.availableAt > a.validFrom)).toBe(true);
        expect(
          walletExchangeResearch({
            token,
            address: wallet,
            labels: mapped,
            transfers: [],
            asOf: a.validFrom,
          }).observedWithdrawalRaw,
        ).toBeNull();
        verified = true;
        throw Error("ROLLBACK_WALLET_CASE");
      });
    } catch (e) {
      if (!(e instanceof Error) || e.message !== "ROLLBACK_WALLET_CASE")
        throw e;
    } finally {
      await closeDb();
    }
    expect(verified).toBe(true);
  },
);
