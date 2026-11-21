import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const localDatabase = process.env.DATABASE_URL
  ? ["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(process.env.DATABASE_URL).hostname,
    )
  : false;

it.skipIf(!localDatabase).each(["esm", "cjs"])(
  "rejects a query on a disconnected reserved PostgreSQL session without crashing (%s)",
  async (entrypoint) => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ["tests/fixtures/postgres-disconnect.mjs", entrypoint],
      { timeout: 12000 },
    );
    expect(stdout).toContain("Closed reserved connection rejected safely");
  },
);
