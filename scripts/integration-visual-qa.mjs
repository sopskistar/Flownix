import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const origin = "http://127.0.0.1:3047";
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
});
const page = await browser.newPage({ reducedMotion: "reduce" });
const report = [];
await mkdir("artifacts/screenshots", { recursive: true });
try {
  for (const [name, width, height] of [
    ["phone", 390, 844],
    ["tablet", 820, 1180],
    ["desktop", 1440, 1000],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page
      .getByRole("searchbox", { name: "Search", exact: true })
      .waitFor();
    await page.waitForFunction(
      () =>
        !globalThis.document.querySelector(".search-filter input")?.disabled,
    );
    const layout = await page.evaluate(() => ({
      width: globalThis.innerWidth,
      scroll: globalThis.document.documentElement.scrollWidth,
      overflow: [...globalThis.document.querySelectorAll("body *")]
        .filter(
          (e) => e.getBoundingClientRect().right > globalThis.innerWidth + 1,
        )
        .slice(0, 15)
        .map((e) => ({
          tag: e.tagName,
          class: e.className,
          width: e.getBoundingClientRect().width,
          text: e.textContent?.slice(0, 110),
        })),
    }));
    report.push({ name, ...layout });
    await page.screenshot({
      path: `artifacts/screenshots/integration-${name}.png`,
      fullPage: true,
    });
  }
  await writeFile(
    "artifacts/integration-visual-qa.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
