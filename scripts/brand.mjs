import { writeFile, mkdir } from "node:fs/promises";
// Original vector geometry: three observations converge into one flow; open structure, no shield or exchange motif.
const mark = (color) =>
  `<g fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 18h22c16 0 16 22 32 22M12 40h54M12 62h22c16 0 16-22 32-22"/><path d="M24 18v44"/></g>`;
const svg = (w, h, body, bg = "none") =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Flownix">${bg === "none" ? "" : `<rect width="${w}" height="${h}" fill="${bg}"/>`}${body}</svg>`;
await mkdir("apps/web/public/brand", { recursive: true });
for (const [theme, color, bg] of [
  ["dark", "#edf0f3", "#101316"],
  ["light", "#17212b", "#f2f4f5"],
]) {
  await writeFile(
    `apps/web/public/brand/mark-${theme}.svg`,
    svg(80, 80, mark(color)),
  );
  await writeFile(
    `apps/web/public/brand/logo-horizontal-${theme}.svg`,
    svg(
      340,
      80,
      `${mark(color)}<text x="92" y="55" fill="${color}" font-family="DejaVu Sans,sans-serif" font-size="44" font-weight="500" letter-spacing="-2">Flownix</text>`,
    ),
  );
  await writeFile(
    `apps/web/public/brand/wordmark-${theme}.svg`,
    svg(
      250,
      70,
      `<text x="8" y="50" fill="${color}" font-family="DejaVu Sans,sans-serif" font-size="46" font-weight="500" letter-spacing="-2">Flownix</text>`,
    ),
  );
  await writeFile(
    `apps/web/public/brand/logo-compact-${theme}.svg`,
    svg(
      180,
      160,
      `<g transform="translate(50 8)">${mark(color)}</g><text x="90" y="134" text-anchor="middle" fill="${color}" font-family="DejaVu Sans,sans-serif" font-size="32" letter-spacing="-1">Flownix</text>`,
    ),
  );
  await writeFile(
    `apps/web/public/brand/app-icon-${theme}.svg`,
    svg(
      512,
      512,
      `<g transform="translate(72 72) scale(4.6)">${mark(color)}</g>`,
      bg,
    ),
  );
}
await writeFile(
  "apps/web/public/icon.svg",
  svg(80, 80, mark("#a7cae2"), "#101316"),
);
await writeFile(
  "apps/web/public/brand/opengraph.svg",
  svg(
    1200,
    630,
    `<g transform="translate(72 80) scale(1.4)">${mark("#a7cae2")}</g><text x="220" y="158" fill="#edf0f3" font-family="DejaVu Sans,sans-serif" font-size="70" letter-spacing="-3">Flownix</text><text x="84" y="350" fill="#edf0f3" font-family="DejaVu Sans,sans-serif" font-size="58" letter-spacing="-2">Evidence before inference.</text><text x="88" y="410" fill="#b4bec8" font-family="DejaVu Sans,sans-serif" font-size="25">Long-term Alpha intelligence. Independent research.</text><path d="M88 496h1024" stroke="#303942"/><text x="88" y="548" fill="#82909e" font-family="DejaVu Sans,sans-serif" font-size="19">Observe. Corroborate. Revisit.</text>`,
    "#101316",
  ),
);
console.log("Original Flownix SVG identity assets generated.");
