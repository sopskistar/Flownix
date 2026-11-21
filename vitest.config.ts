import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: [
      "packages/**/test/**/*.test.ts",
      "apps/**/test/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
    exclude: ["tests/e2e/**", "**/node_modules/**"],
    testTimeout: 20000,
    fileParallelism: false,
  },
});
