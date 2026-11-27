import { test, expect } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import { sqlClient, closeDb } from "../../packages/db/src/index";

test("market observations retain distinct clocks and partial research links, with bounded authenticated refresh", async ({
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
  const sql = sqlClient(),
    id = randomUUID().replaceAll("-", ""),
    symbol = `INTEGRATION_QA_${id.slice(0, 8)}`;
  const contract =
      "0x" + createHash("sha256").update(id).digest("hex").slice(0, 40),
    hash = "0x" + "a".repeat(64),
    address = "0x" + "b".repeat(40);
  const now = Date.now(),
    provider = new Date(now - 2 * 3600000).toISOString(),
    collected = new Date(now - 3600000).toISOString();
  try {
    await sql`INSERT INTO alpha_tokens(id,chain_id,contract,symbol,name,token_id,alpha_id,status,first_seen,last_seen,source,response_hash,metadata) VALUES(${id},'56',${contract},${symbol},'Synthetic local integration fixture',${id},'ALPHA_409','current','2000-01-01','2000-01-01','synthetic-local-only','fixture','{"chainName":"BSC"}')`;
    await sql`INSERT INTO market_snapshots(token_id,symbol,source,source_kind,quote_asset,observed_at,provider_time,price,change_24h,response_hash,raw) VALUES(${id},'ALPHA_409USDT','synthetic-local-only','alpha_market','USDT',${collected},${provider},2.32,-10,'fixture','{}')`;
    await sql`INSERT INTO token_transfers(chain_id,tx_hash,log_index,token_id,block_number,block_hash,event_time,available_at,from_address,to_address,raw_quantity,decimals,kind,source) VALUES('56',${hash},0,${id},100,${hash},${provider},${collected},${address},${contract},1,18,'unknown_transfer','synthetic-local-only')`;
    await sql`INSERT INTO wallet_balance_snapshots(chain_id,address,token_id,block_number,block_hash,raw_quantity,observed_at,source,block_time,decimals) VALUES('56',${address},${id},100,${hash},1,${collected},'synthetic-local-only',${provider},18)`;
    await page.goto(`/?q=${symbol}`, { waitUntil: "domcontentloaded" });
    const row = page.locator(".radar-desktop tbody tr").first();
    await expect(row).toContainText("1 observed on-chain transfers");
    await expect(row).toContainText("Stale / unavailable market");
    await expect(row.locator("td").nth(2)).toContainText("2.32");
    await expect(row.locator("td").nth(2)).not.toContainText("Alpha ticker");
    await expect(row.locator("td").nth(2).locator("small")).toHaveAttribute(
      "title",
      new RegExp(provider),
    );
    await expect(row.locator("td").nth(2).locator("small")).toHaveAttribute(
      "title",
      new RegExp(collected),
    );
    for (const [name, width, height] of [
      ["desktop", 1440, 1000],
      ["tablet", 820, 1180],
      ["phone", 390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      if (width === 820) {
        await expect(row.locator(".radar-price-freshness")).toBeVisible();
        await expect(row.locator(".radar-price-freshness")).toContainText(
          "Stale",
        );
      }
      if (width < 700)
        await page.locator(".radar-mobile-token").scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `artifacts/screenshots/integration-evidence-${name}.png`,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await row
      .getByRole("link", { name: "1 observed on-chain transfers", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Collected research observations",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Collected research evidence" }),
    ).toContainText("Balance snapshot");
    await expect(
      page.getByRole("region", { name: "Collected research evidence" }),
    ).toContainText("Retention and beneficial ownership not established");
    await page
      .getByRole("button", {
        name: "Refresh official quote (5 min cache)",
        exact: true,
      })
      .click();
    await expect(
      page.getByText(
        "Recent official registry identity required; wait for the next duty window.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      (
        await sql`SELECT count(*)::int AS n FROM market_snapshots WHERE token_id=${id}`
      )[0].n,
    ).toBe(1);
  } finally {
    await sql`DELETE FROM wallet_balance_snapshots WHERE token_id=${id}`;
    await sql`DELETE FROM token_transfers WHERE token_id=${id}`;
    await sql`DELETE FROM market_snapshots WHERE token_id=${id}`;
    await sql`DELETE FROM alpha_tokens WHERE id=${id}`;
    await closeDb();
  }
});
