import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  timeout: 90000,
  use: {
    baseURL: "http://127.0.0.1:3047",
    trace: "retain-on-failure",
    launchOptions: process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {},
  },
  webServer: {
    command: "pnpm dev --port 3047",
    url: "http://127.0.0.1:3047",
    reuseExistingServer: false,
    timeout: 120000,
  },
  reporter: "list",
});
