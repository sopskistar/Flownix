import { test, expect } from "@playwright/test";
import { sqlClient, closeDb } from "../../packages/db/src/index";
test("planned duty sleep remains host-unverified while real registry staleness stays visible", async ({
  page,
}) => {
  test.setTimeout(180000);
  test.skip(!process.env.DATABASE_URL, "Requires local PostgreSQL");
  if (
    !["127.0.0.1", "localhost"].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    )
  )
    throw Error("LOCAL_FIXTURE_ONLY");
  const sql = sqlClient(),
    keys = ["worker_heartbeat", "worker_duty_cycle", "registry_sync"],
    before =
      await sql`SELECT key,value,updated_at FROM settings WHERE key=ANY(${keys})`;
  const at = Date.now() - 3600000,
    nextAt = new Date(at + 43200000).toISOString();
  try {
    for (const [key, value] of [
      [
        "worker_heartbeat",
        { at: new Date(at + 1200000).toISOString(), stopped: true },
      ],
      [
        "worker_duty_cycle",
        {
          at: new Date(at).toISOString(),
          nextAt,
          lastFinishedAt: new Date(at + 1200000).toISOString(),
          phase: "idle",
          lastExitCode: 0,
          model: { activeSeconds: 1500, intervalSeconds: 43200 },
        },
      ],
      [
        "registry_sync",
        {
          at: "2000-01-01T00:00:00Z",
          count: 0,
          source: "local-fixture-only",
          hash: "local-fixture",
        },
      ],
    ] as const)
      await sql`INSERT INTO settings(key,value) VALUES(${key},${sql.json(value)}) ON CONFLICT(key) DO UPDATE SET value=excluded.value`;
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByText("Scheduled idle / host unverified", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Registry stale", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Collector running", { exact: true }),
    ).toHaveCount(0);
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByText("Scheduled idle / host unverified", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("The host must be checked separately", { exact: false }),
    ).toBeVisible();
  } finally {
    await sql.begin(async (tx) => {
      await tx`DELETE FROM settings WHERE key=ANY(${keys})`;
      for (const r of before)
        await tx`INSERT INTO settings(key,value,updated_at) VALUES(${r.key},${tx.json(r.value)},${r.updated_at})`;
    });
    await closeDb();
  }
});
