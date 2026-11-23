import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  timeout: 90000,
  expect: { timeout: 30000 },
  use: {
    baseURL: "http://127.0.0.1:3047",
    trace: "retain-on-failure",
    launchOptions: process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {},
  },
  webServer: {
    command:
      "node scripts/web.mjs dev apps/web --hostname 127.0.0.1 --webpack --port 3047",
    // Readiness should not wait on the database-backed Radar query.
    url: "http://127.0.0.1:3047/privacy",
    reuseExistingServer: false,
    timeout: 240000,
  },
  reporter: "list",
});
