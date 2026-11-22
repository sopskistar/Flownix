import { createServer, type Socket } from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it("terminates a worker whose native database startup accepts TCP but never answers", async () => {
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => {});
    socket.on("close", () => sockets.delete(socket));
    socket.on("data", () => {}); // Deliberately silent PostgreSQL handshake fixture.
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("FIXTURE_LISTEN_FAILED");
  try {
    await expect(
      promisify(execFile)(
        process.execPath,
        ["--import", "tsx", "apps/worker/src/index.ts"],
        {
          env: {
            ...process.env,
            DATABASE_URL: `postgresql://fixture:fixture@127.0.0.1:${address.port}/fixture`,
            DATABASE_URL_WORKER: "",
            WORKER_STARTUP_TIMEOUT_SECONDS: "1",
            WORKER_RUN_SECONDS: "0",
            PROVIDER_DNS_SERVERS: "",
          },
          timeout: 8000,
          killSignal: "SIGKILL",
        },
      ),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('"event":"startup_watchdog"'),
    });
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
