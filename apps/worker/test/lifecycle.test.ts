import { expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  held: true,
  claimed: false,
  query: vi.fn(),
  lock: vi.fn(),
  reserve: vi.fn(),
  release: vi.fn(),
  market: vi.fn(),
  closeDb: vi.fn(),
  stopRequests: vi.fn(),
}));
vi.mock("node:fs", async (original) => ({
  ...(await original<typeof import("node:fs")>()),
  writeFileSync: vi.fn(),
}));
vi.mock("@flownix/core", async (original) => {
  const core = await original<typeof import("@flownix/core")>();
  return {
    ...core,
    config: () => ({
      ...core.config(),
      DATABASE_URL_WORKER: undefined,
      WORKER_RUN_SECONDS: 0,
      WORKER_MARKET_OVERLAP: true,
    }),
    stopProviderRequests: fixture.stopRequests,
    closeProviderNetwork: vi.fn(),
  };
});
vi.mock("@flownix/db", () => ({
  sqlClient: () => Object.assign(fixture.query, { reserve: fixture.reserve }),
  jsonParam: (value: unknown) => value,
  closeDb: fixture.closeDb,
  setSetting: vi.fn(),
  workerRequestPolicy: () => ({ reserve: vi.fn(), complete: vi.fn() }),
}));
vi.mock("../src/ingest", () => ({
  registrySync: vi.fn(),
  marketSync: fixture.market,
  scanToken: vi.fn(),
}));
vi.mock("../src/services", () => ({
  queueResearchAlerts: vi.fn(),
  deliverNotifications: vi.fn(),
  outcomesSync: vi.fn(),
  persistenceSync: vi.fn(),
}));
vi.mock("../src/profile", () => ({
  startWorkerProfile: () => ({ phase: vi.fn(), stop: vi.fn() }),
}));
vi.mock("../src/scheduler", () => ({
  reconcileScanJobs: vi.fn(),
  claimNextJob: async (_owner: string, kinds: string[]) => {
    if (!fixture.claimed && kinds.includes("market")) {
      fixture.claimed = true;
      return { key: "market", kind: "market", payload: {}, attempts: 0 };
    }
    return null;
  },
}));

it("cancels reads and drains the active market task before SQL shutdown on heartbeat loss", async () => {
  const originalExitCode = process.exitCode;
  const signals = ["SIGINT", "SIGTERM"] as const;
  const listeners = new Map(
    signals.map((signal) => [signal, process.listeners(signal)]),
  );
  const realInterval = globalThis.setInterval.bind(globalThis);
  const timers: Array<{
    callback: () => void;
    milliseconds: number;
    handle: ReturnType<typeof setInterval>;
  }> = [];
  const interval = vi.spyOn(globalThis, "setInterval").mockImplementation(((
    callback: () => void,
    milliseconds: number,
  ) => {
    const handle = realInterval(() => {}, 3600000);
    handle.unref();
    timers.push({ callback, milliseconds, handle });
    return handle;
  }) as typeof setInterval);
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const output = vi.spyOn(console, "log").mockImplementation(() => {});
  let finishMarket!: (value: { remainingDue: number }) => void;
  fixture.market.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishMarket = resolve;
      }),
  );
  fixture.query.mockImplementation(async (parts) =>
    parts.join("").includes("pg_database_size") ? [{ bytes: "0" }] : [],
  );
  fixture.lock.mockImplementation(async (parts) =>
    parts.join("").includes("pg_try_advisory_lock")
      ? [{ acquired: true }]
      : [{ held: fixture.held }],
  );
  fixture.reserve.mockResolvedValue(
    Object.assign(fixture.lock, { release: fixture.release }),
  );
  try {
    await import("../src/index");
    await vi.waitFor(() => expect(fixture.market).toHaveBeenCalledOnce(), {
      timeout: 5000,
    });
    fixture.held = false;
    timers.find((timer) => timer.milliseconds === 30000)!.callback();
    await vi.waitFor(
      () => expect(fixture.stopRequests).toHaveBeenCalledOnce(),
      { timeout: 5000 },
    );
    expect(fixture.closeDb).not.toHaveBeenCalled();
    finishMarket({ remainingDue: 0 });
    await vi.waitFor(() => expect(fixture.closeDb).toHaveBeenCalled(), {
      timeout: 5000,
    });
    expect(fixture.release).toHaveBeenCalledOnce();
    expect(
      error.mock.calls.some(([message]) =>
        String(message).includes('"event":"heartbeat_failed"'),
      ),
    ).toBe(true);
  } finally {
    finishMarket?.({ remainingDue: 0 });
    for (const timer of timers) clearInterval(timer.handle);
    interval.mockRestore();
    error.mockRestore();
    output.mockRestore();
    for (const signal of signals)
      for (const listener of process.listeners(signal))
        if (!listeners.get(signal)!.includes(listener))
          process.removeListener(signal, listener);
    process.exitCode = originalExitCode;
  }
});
