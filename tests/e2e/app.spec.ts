import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { sqlClient, closeDb } from "../../packages/db/src/index";

const browserErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(async ({ page }) => {
  expect(
    browserErrors.get(page) ?? [],
    "Browser runtime/hydration errors",
  ).toEqual([]);
});

// Local network-interface churn can cancel a read-only Chromium navigation.
// Retry that exact transport error once; application assertions are never retried.
async function navigate(
  page: Page,
  url: string,
  options?: Parameters<Page["goto"]>[1],
) {
  try {
    return await page.goto(url, options);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes("net::ERR_NETWORK_CHANGED")
    )
      throw error;
    return page.goto(url, options);
  }
}

async function expectPageReady(page: Page, heading: string) {
  const main = page.getByRole("main");
  await expect(
    main.getByRole("heading", { level: 1, name: heading, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", {
      name: "Loading research workspace",
      exact: true,
    }),
  ).toBeHidden();
  await expect(main.getByRole("heading", { level: 1 })).toHaveCount(1);
  if (["Alpha Radar", "Accumulation Watchlist"].includes(heading)) {
    await expect(
      main.getByRole("searchbox", { name: "Search", exact: true }),
    ).toBeEnabled({ timeout: 60000 });
  }
}
test.beforeEach(async ({ request }) => {
  const r = await request.get("/privacy");
  expect(r.headers()["x-flownix-workspace"]).toBe("alpha-research");
});
test("private workspace renders honest states and working navigation, themes and filters", async ({
  page,
}) => {
  test.setTimeout(420000);
  await navigate(page, "/", { waitUntil: "domcontentloaded" });
  await expectPageReady(page, "Alpha Radar");
  await expect(
    page.getByRole("region", { name: "Scrollable Alpha token table" }),
  ).toBeVisible();
  // Server HTML can become visible before the client shortcut effect mounts.
  await expect(async () => {
    await page.keyboard.press("Control+k");
    await expect(page.getByLabel("Search Alpha tokens, Control K")).toBeFocused(
      { timeout: 1000 },
    );
  }).toPass({ timeout: 30000 });
  const filterRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.searchParams.has("_rsc") &&
      url.searchParams.get("q") === "nonexistent-test-identity"
    )
      filterRequests.push(url.pathname);
  });
  await page
    .getByLabel("Search", { exact: true })
    .fill("nonexistent-test-identity");
  await expect(page).toHaveURL(/q=nonexistent/, { timeout: 30000 });
  await expect(
    page.getByText("0 matching identities", { exact: true }),
  ).toBeVisible();
  expect(
    filterRequests,
    "Client filters must not refetch the research workspace",
  ).toEqual([]);
  await page.getByLabel("Search", { exact: true }).fill("");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await mkdir("artifacts/screenshots", { recursive: true });
  await page.screenshot({
    path: "artifacts/screenshots/desktop-light.png",
    fullPage: true,
    caret: "initial",
  });
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await page.screenshot({
    path: "artifacts/screenshots/desktop-dark.png",
    fullPage: true,
    caret: "initial",
  });
  await page
    .getByRole("link", { name: "Accumulation Watchlist", exact: true })
    .click();
  await expectPageReady(page, "Accumulation Watchlist");
  await page.getByRole("link", { name: "Data Health", exact: true }).click();
  await expectPageReady(page, "Settings & Data Health");
  await page.screenshot({
    path: "artifacts/screenshots/screen-settings.png",
    fullPage: true,
    caret: "initial",
  });
  for (const [path, heading] of [
    ["/signals", "Alerts & evidence"],
    ["/journal", "Research Journal"],
    ["/research", "Historical Runner Lab"],
    ["/paper", "Performance Lab"],
    ["/clusters", "Wallet Intelligence"],
    ["/rotation", "Exchange Rotation"],
    [
      "/wallet/56/0xa4856e07d14045014b2c3fece5460bd37b310f10",
      "Wallet Detective",
    ],
  ]) {
    await navigate(page, path, { waitUntil: "commit" });
    await expectPageReady(page, heading);
    await page.screenshot({
      path: `artifacts/screenshots/screen-${path.split("/")[1]}.png`,
      fullPage: true,
      caret: "initial",
    });
  }
  await navigate(page, "/nonexistent");
  await expect(
    page.getByRole("heading", { name: "This evidence isn’t here" }),
  ).toBeVisible();
});
test("phone, tablet and reduced motion layouts have no page overflow", async ({
  page,
}) => {
  test.setTimeout(240000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [name, width, height] of [
    ["phone", 390, 844],
    ["tablet", 820, 1180],
    ["desktop", 1440, 1000],
  ] as const) {
    await page.setViewportSize({ width, height });
    await navigate(page, "/", { waitUntil: "domcontentloaded" });
    await expectPageReady(page, "Alpha Radar");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `artifacts/screenshots/${name}.png`,
      fullPage: false,
      caret: "initial",
    });
  }
});
test("Radar filters preserve shared URLs, hydration and browser history without server refetches", async ({
  page,
}) => {
  test.setTimeout(240000);
  await navigate(
    page,
    "/?q=nonexistent-initial&sort=name&context=shared#ledger",
    {
      waitUntil: "domcontentloaded",
    },
  );
  await expectPageReady(page, "Alpha Radar");
  const search = page.getByRole("searchbox", { name: "Search", exact: true });
  const sort = page.getByRole("combobox", { name: "Sort by", exact: true });
  await expect(search).toHaveValue("nonexistent-initial");
  await expect(sort).toHaveValue("name");
  const requests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).searchParams.has("_rsc"))
      requests.push(request.url());
  });
  const historyLength = await page.evaluate(() => history.length);
  await search.fill("nonexistent-replaced");
  await expect(page).toHaveURL(
    /q=nonexistent-replaced&sort=name&context=shared#ledger$/,
  );
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  // Native History entries exercise Next's popstate integration on the same
  // already-loaded ledger, including query parameters owned by other features.
  await page.evaluate(() => {
    const url = new URL(location.href);
    url.searchParams.set("q", "nonexistent-forward");
    url.searchParams.set("sort", "cap");
    url.searchParams.set("page", "3");
    history.pushState(null, "", url);
  });
  await expect(search).toHaveValue("nonexistent-forward");
  await expect(sort).toHaveValue("cap");
  await page.goBack();
  await expect(search).toHaveValue("nonexistent-replaced");
  await expect(sort).toHaveValue("name");
  await page.goForward();
  await expect(search).toHaveValue("nonexistent-forward");
  await expect(sort).toHaveValue("cap");
  await sort.selectOption("name");
  await expect(page).toHaveURL(
    /q=nonexistent-forward&sort=name&context=shared#ledger$/,
  );
  await expect(
    page.getByText("0 matching identities", { exact: true }),
  ).toBeVisible();
  expect(requests, "Filters and popstate must reuse the loaded ledger").toEqual(
    [],
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await expectPageReady(page, "Alpha Radar");
  await expect(search).toHaveValue("nonexistent-forward");
  await expect(sort).toHaveValue("name");
});
test("remote or forwarded requests and cross-origin mutations are rejected", async ({
  request,
}) => {
  const remote = await request.get("/", { headers: { Host: "example.com" } });
  expect(remote.status()).toBe(200);
  expect(await remote.text()).toContain("Remote access is locked");
  const forwarded = await request.get("/api/export?kind=tokens", {
    headers: { "x-forwarded-for": "203.0.113.1" },
  });
  expect(forwarded.status()).toBe(401);
  const mutation = await request.post("/api/actions", {
    headers: { Origin: "https://evil.example" },
    data: { action: "sync" },
  });
  expect(mutation.status()).toBe(403);
  const invalid = await request.post("/api/actions", {
    headers: { Origin: "http://127.0.0.1:3047" },
    data: { action: "watch", tokenId: "BTCUSDT", enabled: true },
  });
  expect(invalid.status()).toBe(400);
});
test("in-app notification and journal persist without external credentials", async ({
  page,
}) => {
  test.skip(
    !process.env.DATABASE_URL,
    "Requires documented local PostgreSQL configuration",
  );
  await navigate(page, "/signals");
  await expectPageReady(page, "Alerts & evidence");
  await page.getByRole("button", { name: "Test in-app notification" }).click();
  await expect(
    page.getByText("In-app test recorded. View Alerts."),
  ).toBeVisible();
  await expect(
    page
      .getByRole("cell", {
        name: "Flownix connection test — independent Alpha research. No trading action.",
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await navigate(page, "/journal");
  await expectPageReady(page, "Research Journal");
  const note = `Browser smoke test ${randomUUID()} — manual setup note, no market claim.`;
  await page
    .getByRole("textbox", { name: "Research note or hypothesis" })
    .fill(note);
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Journal note saved")).toBeVisible();
  await expect(page.getByText(note, { exact: true })).toBeVisible();
});

test("token research intake preserves claims, revisions and Solana wallet identity", async ({
  page,
  request,
}) => {
  test.setTimeout(240000);
  test.skip(!process.env.DATABASE_URL, "Requires local PostgreSQL");
  const host = new URL(process.env.DATABASE_URL!).hostname;
  if (!["localhost", "127.0.0.1"].includes(host))
    throw Error("Browser fixtures require local PostgreSQL");
  const sql = sqlClient(),
    contract = "0x" + "f".repeat(40),
    id = createHash("sha256")
      .update(`56:${contract}`)
      .digest("hex")
      .slice(0, 32);
  try {
    await sql`INSERT INTO alpha_tokens(id,chain_id,contract,symbol,name,token_id,alpha_id,status,first_seen,last_seen,source,response_hash,metadata) VALUES(${id},'56',${contract},'LOCAL_TEST','Local browser fixture','local-browser-only','LOCAL_TEST','current',now(),now(),'local-test-only','local-test-only','{}')`;
    await navigate(page, `/token/${id}`);
    await expect(
      page.getByRole("heading", {
        name: "Supply concentration & connected wallets",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Unavailable — a complete reconciled holder census is required",
        { exact: true },
      ),
    ).toBeVisible();
    await page
      .getByText("Add a source-linked research lead", { exact: true })
      .click();
    await page
      .getByLabel("Original source URL", { exact: true })
      .fill("https://example.com/local-browser-research-fixture");
    await page
      .getByLabel("Claimed publication (ISO UTC, optional)", { exact: true })
      .fill("2020-01-01T00:00:00Z");
    await page
      .getByLabel("Research summary and contradictory evidence", {
        exact: true,
      })
      .fill(
        "Local browser fixture only. An unverified source-linked research lead.",
      );
    await page
      .getByRole("button", { name: "Save research lead", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Source-linked lead saved" }),
    ).toBeVisible();
    const lead = (
      await sql`SELECT * FROM research_leads WHERE token_id=${id}`
    )[0];
    expect(lead.status).toBe("manual_lead");
    expect(lead.published_at).toBeNull();
    expect(lead.verified_at).toBeNull();
    expect(new Date(lead.first_observed_at).getUTCFullYear()).toBeGreaterThan(
      2020,
    );
    const revision = await request.post("/api/actions", {
      headers: { Origin: "http://127.0.0.1:3047" },
      data: {
        action: "research_lead",
        tokenId: id,
        kind: "social",
        sourceUrl: "https://example.com/local-browser-research-fixture",
        revisionOf: lead.id,
        body: "Local-only revision preserving contradictory evidence and original observation.",
      },
    });
    expect(revision.status()).toBe(200);
    expect(
      (await sql`SELECT id FROM research_leads WHERE token_id=${id}`).length,
    ).toBe(2);
    for (const [name, width, height] of [
      ["desktop", 1440, 1000],
      ["phone", 390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.reload();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `artifacts/screenshots/research-token-${name}.png`,
        fullPage: true,
      });
    }
    const mint = "So11111111111111111111111111111111111111112";
    await navigate(page, `/wallet/CT_501/${mint}`);
    await expectPageReady(page, "Wallet Detective");
    await expect(
      page.getByRole("link", { name: "View on explorer" }),
    ).toHaveAttribute("href", `https://solscan.io/account/${mint}`);
  } finally {
    await sql`DELETE FROM research_leads WHERE token_id=${id} AND revision_of IS NOT NULL`;
    await sql`DELETE FROM research_leads WHERE token_id=${id}`;
    await sql`DELETE FROM alpha_tokens WHERE id=${id}`;
    await closeDb();
  }
});
