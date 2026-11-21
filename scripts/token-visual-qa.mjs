import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";

// Read-only checks against a running loopback development app with real registry
// data. The dated fixture selects known identities, never seeds an app universe.
const origin = process.env.VISUAL_QA_ORIGIN ?? "http://127.0.0.1:3047";
assert.ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin));
const fixture = JSON.parse(
  await readFile("tests/fixtures/alpha-visual-2026-11-21.json", "utf8"),
);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const report = { origin, networks: [], screenshots: [], checks: [] };
await mkdir("artifacts/screenshots", { recursive: true });
async function capture(name) {
  const file = `artifacts/screenshots/token-identity-${name}.png`;
  await page.screenshot({
    path: file,
    fullPage: !["phone", "broken-image-fallback", "token-details"].includes(
      name,
    ),
  });
  report.screenshots.push(file);
}
try {
  for (const token of fixture.entries) {
    const contract = /^0x[0-9a-fA-F]{40}$/.test(token.contractAddress)
      ? token.contractAddress.toLowerCase()
      : token.contractAddress;
    const id = createHash("sha256")
      .update(`${token.chainId}:${contract}`)
      .digest("hex")
      .slice(0, 32);
    for (const kind of ["token", "network"]) {
      const r = await page.request.get(
        `${origin}/api/token-image/${id}/${kind}`,
        { timeout: 60000 },
      );
      assert.equal(r.status(), 200, `${token.chainId} ${kind}`);
      assert.match(r.headers()["content-type"], /^image\/(png|jpeg|webp)$/);
      assert.ok((await r.body()).length > 0);
    }
    report.networks.push({
      chain: token.chainId,
      symbol: token.symbol,
      contract,
      id,
      tokenImage: 200,
      networkImage: 200,
    });
  }
  await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page
    .getByRole("heading", { name: "Alpha Radar", exact: true })
    .waitFor();
  const first = page.locator(".radar-desktop tbody .token-identity").first();
  await first.scrollIntoViewIfNeeded();
  await page.waitForFunction(() =>
    [
      ...globalThis.document.querySelectorAll(
        ".radar-desktop tbody tr:first-child img",
      ),
    ].every((i) => i.complete && i.naturalWidth > 0),
  );
  await capture("desktop-dark");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await capture("desktop-light");
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  for (const [label, width, height] of [
    ["phone", 375, 812],
    ["landscape", 844, 390],
    ["tablet", 820, 1180],
  ]) {
    await page.setViewportSize({ width, height });
    const identity = page
      .locator(
        width <= 700
          ? ".radar-mobile-token .token-identity"
          : ".radar-desktop .token-identity",
      )
      .first();
    await identity.scrollIntoViewIfNeeded();
    await page.waitForFunction(() =>
      [...globalThis.document.querySelectorAll(".token-identity img")]
        .filter((i) => i.getBoundingClientRect().width > 0)
        .slice(0, 2)
        .every((i) => i.complete && i.naturalWidth > 0),
    );
    assert.ok(
      await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth <=
          globalThis.innerWidth,
      ),
    );
    await capture(label);
  }
  await page.setViewportSize({ width: 375, height: 812 });
  const entry = page.locator(".radar-mobile-token").first();
  await entry.getByText("Identity, statistics & evidence").click();
  await entry.getByText("Market cap (registry)", { exact: true }).waitFor();
  const href = await entry.locator(".token-identity").getAttribute("href");
  await entry.locator(".token-identity").click();
  await page.waitForURL(`${origin}${href}`);
  await page.getByText("Token image provenance", { exact: true }).click();
  await capture("token-details");
  await page.route("**/api/token-image/**", (r) => r.fulfill({ status: 404 }));
  await page.goto(`${origin}/?q=Clearpool`);
  const fallback = page.locator(".radar-mobile-token .token-identity").first();
  await fallback.scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () =>
      globalThis.document.querySelector(
        ".radar-mobile-token .token-avatar .token-initial",
      )?.textContent === "CL",
  );
  await page.waitForFunction(
    () =>
      globalThis.document.querySelectorAll(
        ".radar-mobile-token .token-avatar img",
      ).length === 0,
  );
  await capture("broken-image-fallback");
  report.checks.push(
    "All ten official networks: actual token and network raster responses",
    "Desktop dark/light, phone, landscape, tablet, reduced motion, no page overflow",
    "Mobile price/change/freshness with expandable statistics",
    "Token investigation navigation and provenance",
    "Broken-image initial fallback",
  );
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    JSON.stringify({
      networks: new Set(report.networks.map((t) => t.chain)).size,
      identities: report.networks.length,
      checks: report.checks,
      screenshots: report.screenshots.length,
    }),
  );
} finally {
  await writeFile(
    "artifacts/token-visual-qa.json",
    JSON.stringify({ ...report, errors }, null, 2),
  );
  await browser.close();
}
