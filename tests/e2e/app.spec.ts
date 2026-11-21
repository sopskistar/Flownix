import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";

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
}
test.beforeEach(async ({ request }) => {
  const r = await request.get("/privacy");
  expect(r.headers()["x-flownix-workspace"]).toBe("alpha-research");
});
test("private workspace renders honest states and working navigation, themes and filters", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expectPageReady(page, "Alpha Radar");
  await expect(
    page.getByRole("region", { name: "Scrollable Alpha token table" }),
  ).toBeVisible();
  // Server HTML can become visible before the client shortcut effect mounts.
  await expect(async () => {
    await page.keyboard.press("Control+k");
    await expect(
      page.getByLabel("Search Alpha tokens, Control K"),
    ).toBeFocused();
  }).toPass({ timeout: 30000 });
  await page
    .getByLabel("Search", { exact: true })
    .fill("nonexistent-test-identity");
  await expect(page).toHaveURL(/q=nonexistent/, { timeout: 30000 });
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
    await page.goto(path, { waitUntil: "commit" });
    await expectPageReady(page, heading);
    await page.screenshot({
      path: `artifacts/screenshots/screen-${path.split("/")[1]}.png`,
      fullPage: true,
      caret: "initial",
    });
  }
  await page.goto("/nonexistent");
  await expect(
    page.getByRole("heading", { name: "This evidence isn’t here" }),
  ).toBeVisible();
});
test("phone, tablet and reduced motion layouts have no page overflow", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [name, width, height] of [
    ["phone", 390, 844],
    ["tablet", 820, 1180],
    ["desktop", 1440, 1000],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expectPageReady(page, "Alpha Radar");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `artifacts/screenshots/${name}.png`,
      fullPage: true,
      caret: "initial",
    });
  }
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
  await page.goto("/signals");
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
  await page.goto("/journal");
  await expectPageReady(page, "Research Journal");
  const note = `Browser smoke test ${randomUUID()} — manual setup note, no market claim.`;
  await page
    .getByRole("textbox", { name: "Research note or hypothesis" })
    .fill(note);
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Journal note saved")).toBeVisible();
  await expect(page.getByText(note, { exact: true })).toBeVisible();
});
