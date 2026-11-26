import { test, expect } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import {
  sqlClient,
  closeDb,
  ensureWalletMonitoring,
  appendWalletLabel,
} from "../../packages/db/src/index";
import { tokenKey } from "../../packages/core/src/index";
test("wallet exchange research preserves exact identities, provisional labels, missing history and responsive evidence links", async ({
  page,
}) => {
  test.setTimeout(240000);
  test.skip(!process.env.DATABASE_URL, "Requires local PostgreSQL");
  if (
    !["127.0.0.1", "localhost"].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    )
  )
    throw Error("LOCAL_FIXTURE_ONLY");
  const random = () => createHash("sha256").update(randomUUID()).digest("hex"),
    contract = "0x" + random().slice(0, 40),
    wallet = "0x" + random().slice(0, 40),
    exchange = "0x" + random().slice(0, 40),
    tx = "0x" + random(),
    id = tokenKey("56", contract),
    sql = sqlClient();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await sql`INSERT INTO alpha_tokens(id,chain_id,contract,symbol,name,token_id,alpha_id,status,first_seen,last_seen,source,response_hash,metadata) VALUES(${id},'56',${contract},'FLOW_TEST','Exchange-flow browser fixture','browser-only','LOCAL_FLOW','current',now(),now(),'local-fixture-only','local-fixture-only','{}')`;
    await ensureWalletMonitoring(
      { id, chain: "56", contract },
      wallet,
      "Local browser fixture; ownership unknown",
    );
    await appendWalletLabel({
      chain: "56",
      address: exchange,
      entity: "Fixture Exchange",
      role: "possible_exchange",
      sourceUrl: "https://example.com/local-fixture",
      confidence: "Third-party attribution; unverified",
      validFrom: "2026-01-01T00:00:00Z",
      validTo: null,
      reviewedBy: null,
      detail: {
        version: "exchange-address/1",
        accountRole: "withdrawal",
        basis: "fixture_only",
        publishedAt: null,
        notes: "Synthetic browser fixture only",
        contradictions: [],
      },
    });
    await sql`INSERT INTO token_transfers(chain_id,tx_hash,log_index,token_id,block_number,block_hash,event_time,available_at,from_address,to_address,raw_quantity,decimals,kind,source) VALUES('56',${tx},0,${id},100,${tx},now(),now(),${exchange},${wallet},'123000000000000000000',18,'unknown_transfer','local-fixture-only')`;
    await page.goto(`/wallet/56/${wallet}`, { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", {
        name: "Monitored Alpha tokens & exchange flows",
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Active investigation", { exact: false }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Monitored Alpha wallet tokens" })
        .getByText("Unavailable", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Possible exchange withdrawal", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText("Reviewed-address withdrawals: Unavailable", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Label source" }),
    ).toHaveAttribute("href", "https://example.com/local-fixture");
    await expect(
      page.locator(`a[href="https://bscscan.com/tx/${tx}"]`).first(),
    ).toBeVisible();
    await expect(page.locator(`a[href="/token/${id}"]`).first()).toBeVisible();
    await mkdir("artifacts/screenshots", { recursive: true });
    for (const [name, width, height] of [
      ["desktop", 1440, 1000],
      ["tablet", 820, 1180],
      ["phone", 390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: "reduce" });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await page
          .getByText(contract, { exact: true })
          .evaluate((el) =>
            [...el.getClientRects()].every((rect) => rect.right <= innerWidth),
          ),
      ).toBe(true);
      await page.screenshot({
        path: `artifacts/screenshots/wallet-exchange-${name}.png`,
        fullPage: true,
      });
    }
    await page.goto(`/token/${id}`, { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Investigation wallets" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: wallet, exact: true }),
    ).toHaveAttribute("href", `/wallet/56/${wallet}`);
    expect(errors).toEqual([]);
  } finally {
    await sql`DELETE FROM token_transfers WHERE token_id=${id}`;
    await sql`DELETE FROM wallet_monitoring WHERE token_id=${id}`;
    await sql`DELETE FROM wallet_labels WHERE address=${exchange} AND source_url='https://example.com/local-fixture'`;
    await sql`DELETE FROM wallets WHERE chain_id='56' AND address=${wallet}`;
    await sql`DELETE FROM alpha_tokens WHERE id=${id}`;
    await closeDb();
  }
});
