import { test, expect } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { sqlClient, closeDb } from "../../packages/db/src/index";

test("Universe Ledger sorts the entire filtered universe and preserves identity, watch and stale evidence", async ({
  page,
}) => {
  test.setTimeout(240000);
  test.skip(!process.env.DATABASE_URL, "Requires local PostgreSQL");
  if (
    !["localhost", "127.0.0.1"].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    )
  )
    throw Error("Browser fixtures require local PostgreSQL");
  const sql = sqlClient(),
    prefix = `LEDGER_QA_${randomUUID().slice(0, 8)}`;
  const values = [
    "150",
    "85",
    "20",
    "5",
    "0",
    "-3",
    "-12",
    "5.5",
    "-0.5",
    "20",
    null,
    ...Array.from({ length: 25 }, (_, i) => String(200 + i)),
    "5000",
  ];
  const rows = values.map((value, i) => {
    const contract =
        "0x" +
        createHash("sha256")
          .update(`${prefix}:${i}`)
          .digest("hex")
          .slice(0, 40),
      chain = i === 2 || i === 3 ? "8453" : "56";
    return {
      id: createHash("sha256")
        .update(`${chain}:${contract}`)
        .digest("hex")
        .slice(0, 32),
      contract,
      chain,
      chainName: chain === "56" ? "BSC" : "Base",
      symbol: `${prefix}_${String(i).padStart(2, "0")}`,
      alphaId: `ALPHA_${prefix}_${i}`,
      status: i === values.length - 1 ? "offline" : "current",
      stage: i === 2 ? "OBSERVATION" : "DISCOVERY",
      value,
      cap: i === 11 ? null : String((i + 1) * 1000000),
      liquidity: i === 12 ? null : String(100000 + i * 1000),
      volume: i === 13 ? null : String((values.length - i) * 1000),
    };
  });
  const oldSettings =
    await sql`SELECT key,value,updated_at FROM settings WHERE key=ANY(${["registry_sync", "worker_heartbeat"]})`;
  const ids = rows.map((r) => r.id);
  try {
    await sql.begin(async (tx) => {
      for (const r of rows) {
        await tx`INSERT INTO alpha_tokens(id,chain_id,contract,symbol,name,token_id,alpha_id,status,research_state,first_seen,last_seen,source,response_hash,metadata) VALUES(${r.id},${r.chain},${r.contract},${r.symbol},'Synthetic local browser fixture',${r.id},${r.alphaId},${r.status},${r.stage},'2000-01-01','2000-01-01','synthetic-local-browser-only','local-fixture',${tx.json({ chainName: r.chainName, marketCap: r.cap, liquidity: r.liquidity })})`;
        await tx`INSERT INTO market_snapshots(token_id,source,source_kind,quote_asset,observed_at,provider_time,price,change_24h,volume_24h,response_hash,raw) VALUES(${r.id},'synthetic-local-browser-only','alpha_market','USDT','2000-01-01','2000-01-01',1,${r.value},${r.volume},'local-fixture','{}')`;
      }
      await tx`INSERT INTO token_project_classifications(token_id,classification,evidence_url,evidence_note,reviewed_by) VALUES(${rows[2].id},'verified_meme_focused','https://example.com/local-fixture','Synthetic local fixture only','browser-test')`;
      await tx`INSERT INTO settings(key,value) VALUES('registry_sync',${tx.json({ at: "2000-01-01T00:00:00Z", count: rows.length, source: "synthetic-local-browser-only", hash: "local-fixture" })}),('worker_heartbeat',${tx.json({ at: "2000-01-01T00:00:00Z", stopped: true })}) ON CONFLICT(key) DO UPDATE SET value=excluded.value`;
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/?q=${prefix}`, { waitUntil: "domcontentloaded" });
    const search = page.getByRole("searchbox", { name: "Search", exact: true }),
      sort = page.getByRole("combobox", { name: "Sort by", exact: true });
    await expect(search).toBeEnabled();
    await expect(sort).toHaveValue("change_desc");
    await expect(
      page.getByText("Registry stale", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Collector offline / unverified", { exact: true }),
    ).toBeVisible();
    const table = page.locator(".radar-desktop table");
    await expect(table.locator("th")).toHaveText([
      "Watch",
      "Token / network",
      "Alpha price",
      "24h change",
      "Market cap",
      "Liquidity",
      "24h quote volume",
      "Research / evidence",
      "Observation",
    ]);
    await expect(table.locator("tbody tr").first().locator("td")).toHaveCount(
      9,
    );
    await expect(
      page.getByText("stale Alpha ticker", { exact: true }).first(),
    ).toBeVisible();
    await expect(table.locator(".token-portrait").first()).toBeVisible();
    const links = () =>
      table
        .locator("tbody .token-identity")
        .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    const current = rows.filter((r) => r.status === "current");
    const ordered = (
      field: "value" | "cap" | "liquidity" | "volume",
      asc = false,
      items = current,
    ) =>
      items.toSorted((a, b) =>
        a[field] === null || b[field] === null
          ? a[field] === null && b[field] === null
            ? a.id.localeCompare(b.id)
            : a[field] === null
              ? 1
              : -1
          : (Number(a[field]) - Number(b[field])) * (asc ? 1 : -1) ||
            a.id.localeCompare(b.id),
      );
    const hrefs = (items: typeof rows) => items.map((r) => `/token/${r.id}`);
    await expect.poll(links).toEqual(hrefs(ordered("value").slice(0, 30)));
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect.poll(links).toEqual(hrefs(ordered("value").slice(30)));
    const workspaceRequests: string[] = [];
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (u.pathname === "/" && u.searchParams.has("_rsc"))
        workspaceRequests.push(u.href);
    });
    for (const [key, field, asc] of [
      ["change_asc", "value", true],
      ["cap", "cap", false],
      ["cap_asc", "cap", true],
      ["liquidity", "liquidity", false],
      ["liquidity_asc", "liquidity", true],
      ["volume", "volume", false],
      ["volume_asc", "volume", true],
      ["change_desc", "value", false],
    ] as const) {
      await sort.selectOption(key);
      await expect.poll(links).toEqual(hrefs(ordered(field, asc).slice(0, 30)));
    }
    const optionLabels = await sort.locator("option").allTextContents();
    expect(new Set(optionLabels).size).toBe(optionLabels.length);
    await sort.selectOption("change_asc");
    await search.fill(rows[0].alphaId);
    await expect.poll(links).toEqual(hrefs([rows[0]]));
    await expect(sort).toHaveValue("change_asc");
    await search.fill(prefix);
    await page
      .getByRole("combobox", { name: "Chain", exact: true })
      .selectOption("8453");
    await expect.poll(links).toEqual(
      hrefs(
        ordered(
          "value",
          true,
          current.filter((r) => r.chain === "8453"),
        ),
      ),
    );
    await page
      .getByRole("combobox", { name: "Project classification", exact: true })
      .selectOption("verified_meme_focused");
    await expect.poll(links).toEqual(hrefs([rows[2]]));
    await page.getByText("Research stage filter", { exact: true }).click();
    await page
      .getByRole("combobox", { name: "Lifecycle", exact: true })
      .selectOption("OBSERVATION");
    await expect.poll(links).toEqual(hrefs([rows[2]]));
    await page
      .getByRole("combobox", { name: "Lifecycle", exact: true })
      .selectOption("");
    await page
      .getByRole("combobox", { name: "Project classification", exact: true })
      .selectOption("");
    await page
      .getByRole("combobox", { name: "Chain", exact: true })
      .selectOption("");
    await page
      .getByRole("combobox", { name: "Membership", exact: true })
      .selectOption("offline");
    await expect.poll(links).toEqual(hrefs([rows.at(-1)!]));
    await page
      .getByRole("combobox", { name: "Membership", exact: true })
      .selectOption("current");
    await page
      .getByRole("combobox", { name: "Min. cap (registry)", exact: true })
      .selectOption("10000000");
    await expect.poll(links).toEqual(
      hrefs(
        ordered(
          "value",
          true,
          current.filter((r) => r.cap !== null && Number(r.cap) >= 10000000),
        ),
      ),
    );
    await page
      .getByRole("combobox", { name: "Min. cap (registry)", exact: true })
      .selectOption("");
    await search.fill("NO_MATCH_LEDGER_QA");
    await expect(
      page.getByRole("heading", { name: "No identities match these filters" }),
    ).toBeVisible();
    await search.fill(prefix);
    expect(workspaceRequests).toEqual([]);
    await sort.selectOption("change_desc");
    for (const [name, width, height] of [
      ["desktop", 1440, 1000],
      ["tablet", 820, 1180],
      ["phone", 390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      await expect(sort).toHaveValue("change_desc");
      if (name === "phone") {
        await sort.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: "artifacts/screenshots/ledger-phone-controls.png",
        });
        await page
          .locator(".radar-mobile-token")
          .first()
          .scrollIntoViewIfNeeded();
      } else
        await page
          .getByRole("heading", { name: "Universe ledger", exact: true })
          .scrollIntoViewIfNeeded();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `artifacts/screenshots/ledger-${name}.png`,
      });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await search.fill(rows[0].symbol);
    const save = table
      .locator("tbody tr")
      .getByRole("button", { name: "Watch " + rows[0].symbol, exact: true });
    await save.click();
    await expect(
      table.locator("tbody tr").getByRole("button", {
        name: "Unwatch " + rows[0].symbol,
        exact: true,
      }),
    ).toBeVisible();
    expect(
      (
        await sql`SELECT archived FROM watchlists WHERE token_id=${rows[0].id}`
      )[0].archived,
    ).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await sql`DELETE FROM watchlists WHERE token_id=ANY(${ids})`;
    await sql`DELETE FROM token_project_classifications WHERE token_id=ANY(${ids})`;
    await sql`DELETE FROM market_snapshots WHERE token_id=ANY(${ids})`;
    await sql`DELETE FROM alpha_tokens WHERE id=ANY(${ids})`;
    await sql`DELETE FROM settings WHERE key=ANY(${["registry_sync", "worker_heartbeat"]})`;
    for (const s of oldSettings)
      await sql`INSERT INTO settings(key,value,updated_at) VALUES(${s.key},${sql.json(s.value)},${s.updated_at})`;
    await closeDb();
  }
});
