import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";

// Public, unauthenticated checks only. Never manufacture a production session.
const origin = new URL(process.env.PRODUCTION_URL ?? "https://flownix.xyz");
assert.equal(origin.protocol, "https:");
assert.equal(origin.pathname, "/");
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
});
const errors = [];
const context = await browser.newContext({ reducedMotion: "reduce" });
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
const target = (path) => new URL(path, origin).href;
const result = { origin: origin.origin, privateRoutes: {}, screenshots: [] };
const secrets = [
  "GITHUB_CLIENT_SECRET",
  "NEXTAUTH_SECRET",
  "DATABASE_URL",
  "DATABASE_URL_WORKER",
]
  .map((key) => process.env[key])
  .filter(Boolean);
const bodies = [];
page.on("response", async (response) => {
  if (
    response.url().startsWith(origin.origin) &&
    /javascript|html|json/.test(response.headers()["content-type"] ?? "")
  ) {
    try {
      bodies.push(await response.text());
    } catch {
      /* navigation cancelled */
    }
  }
});
try {
  const response = await page.goto(target("/login"));
  assert.equal(response.status(), 200);
  await page
    .getByRole("heading", { level: 1, name: "Your private research workspace" })
    .waitFor();
  await page
    .getByRole("button", { name: "Continue with GitHub", exact: true })
    .waitFor();
  assert.match(response.headers()["x-robots-tag"], /noindex/);
  await mkdir("artifacts/screenshots", { recursive: true });
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["tablet", 820, 1180],
    ["phone", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    assert.ok(
      await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth <=
          globalThis.innerWidth,
      ),
    );
    const path = `artifacts/screenshots/production-login-${name}.png`;
    await page.screenshot({ path, fullPage: true });
    result.screenshots.push(path);
  }
  for (const path of [
    "/",
    "/watchlist",
    "/journal",
    "/signals",
    "/settings",
    "/clusters",
    "/rotation",
    "/research",
    "/paper",
    "/token/unknown",
    "/wallet/56/0x0000000000000000000000000000000000000001",
  ]) {
    const response = await context.request.get(target(path), {
      maxRedirects: 0,
    });
    assert.ok(
      [303, 307].includes(response.status()),
      `${path} did not require login`,
    );
    assert.equal(
      new URL(response.headers().location, origin).pathname,
      "/login",
    );
    result.privateRoutes[path] = "requires login";
  }
  for (const path of ["/api/export?kind=signals", "/api/actions"]) {
    const response = path.includes("actions")
      ? await context.request.post(target(path), { data: { action: "sync" } })
      : await context.request.get(target(path));
    assert.equal(response.status(), 401);
  }
  const session = await context.request.get(target("/api/auth/session"));
  assert.equal(session.status(), 200);
  assert.deepEqual(await session.json(), {});
  result.unauthenticatedApi = "401; empty session";
  const forged = await context.request.get(target("/api/export?kind=signals"), {
    headers: {
      Cookie: "__Secure-next-auth.session-token=invalid-unsigned-session",
    },
  });
  assert.equal(forged.status(), 401);
  const forwarded = await context.request.post(target("/api/actions"), {
    headers: {
      Host: origin.host,
      "X-Forwarded-For": "127.0.0.1",
      "X-Forwarded-Host": "127.0.0.1:3000",
      Origin: origin.origin,
    },
    data: { action: "sync" },
  });
  assert.equal(forwarded.status(), 401);
  const rsc = await context.request.get(
    target("/journal?_rsc=security-check"),
    {
      headers: { RSC: "1" },
      maxRedirects: 0,
    },
  );
  const flight = await rsc.text();
  // Next may encode redirects in an already-started RSC stream with HTTP 200.
  assert.ok(
    [303, 307].includes(rsc.status()) ||
      (rsc.status() === 200 &&
        flight.includes("NEXT_REDIRECT") &&
        flight.includes("/login")),
    "Journal RSC response did not redirect to login",
  );
  assert.ok(
    !flight.includes("Production verification"),
    "Private note appeared in an unauthenticated RSC response",
  );
  result.invalidSessionAndForwardedHeaders = "401; RSC journal requires login";
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Continue with GitHub", exact: true })
    .click();
  await page.waitForURL((url) => url.hostname === "github.com");
  result.oauthHandoff =
    "GitHub authorization/login reached; user authorization still required";
  const cookies = (await context.cookies(origin.origin)).filter((cookie) =>
    cookie.name.includes("next-auth"),
  );
  assert.ok(
    cookies.some(
      (cookie) =>
        cookie.name.includes("csrf-token") && cookie.httpOnly && cookie.secure,
    ),
  );
  assert.ok(
    cookies.some(
      (cookie) =>
        cookie.name.includes("state") && cookie.httpOnly && cookie.secure,
    ),
  );
  result.secureAuthCookies = true;
  assert.equal(errors.length, 0, "Browser runtime errors occurred");
  assert.ok(
    !bodies.some((body) => secrets.some((secret) => body.includes(secret))),
    "Server secret found in browser response",
  );
  result.serverSecretsInResponses =
    "none detected among supplied secret values";
  result.authenticatedChecks =
    "NOT RUN — requires the owner's real GitHub session";
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
