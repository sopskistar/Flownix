import { chromium } from "@playwright/test";
import { readFile, readdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
);
try {
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  for (const file of (await readdir("apps/web/public/brand")).filter((f) =>
    f.endsWith(".svg"),
  )) {
    const raw = await readFile("apps/web/public/brand/" + file, "utf8");
    await page.setContent(
      '<html><body style="margin:0;background:transparent">' +
        raw +
        "</body></html>",
    );
    await page
      .locator("svg")
      .screenshot({
        path: "apps/web/public/brand/" + file.replace(".svg", ".png"),
        omitBackground: true,
      });
  }
  const png = await readFile("apps/web/public/brand/app-icon-dark.png");
  await writeFile("apps/web/public/brand/app-icon.png", png);
  await writeFile(
    "apps/web/public/brand/github-social.png",
    await readFile("apps/web/public/brand/opengraph.png"),
  );
  console.log("PNG brand exports rendered from original SVG sources.");
} finally {
  await browser.close();
}
