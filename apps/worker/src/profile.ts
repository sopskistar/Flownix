import { channel } from "node:diagnostics_channel";
import type { Socket } from "node:net";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { processMetrics } from "@flownix/core";

export function startWorkerProfile() {
  if (!process.argv.includes("--profile"))
    return { phase: (_: string) => {}, stop: () => {} };
  const started = Date.now(),
    initialCpu = process.cpuUsage();
  const sockets = new Set<Socket>();
  let closedRead = 0,
    closedWritten = 0,
    logBytes = 0,
    phase = "startup";
  const samples: Record<string, unknown>[] = [];
  const subscriber = (message: unknown) => {
    const socket = (message as { socket: Socket }).socket;
    sockets.add(socket);
    socket.once("close", () => {
      closedRead += socket.bytesRead;
      closedWritten += socket.bytesWritten;
      sockets.delete(socket);
    });
  };
  channel("net.client.socket").subscribe(subscriber);
  const originalWrite = process.stdout.write.bind(process.stdout);
  const originalError = process.stderr.write.bind(process.stderr);
  // Count bytes without storing potentially sensitive log contents.
  process.stdout.write = ((chunk: string | Uint8Array, ...args: unknown[]) => {
    logBytes += Buffer.byteLength(chunk);
    return Reflect.apply(originalWrite, process.stdout, [chunk, ...args]);
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array, ...args: unknown[]) => {
    logBytes += Buffer.byteLength(chunk);
    return Reflect.apply(originalError, process.stderr, [chunk, ...args]);
  }) as typeof process.stderr.write;
  mkdirSync("artifacts/profiles", { recursive: true });
  const path = `artifacts/profiles/worker-${new Date(started).toISOString().replaceAll(":", "-")}.json`;
  function sample() {
    let linuxHighWaterBytes: number | null = null;
    try {
      linuxHighWaterBytes =
        Number(
          readFileSync("/proc/self/status", "utf8").match(
            /^VmHWM:\s+(\d+)/m,
          )?.[1],
        ) * 1024 || null;
    } catch {
      /* Non-Linux host. */
    }
    const memory = process.memoryUsage(),
      cpu = process.cpuUsage(initialCpu);
    const io = [...sockets].reduce(
      (total, socket) => ({
        read: total.read + socket.bytesRead,
        written: total.written + socket.bytesWritten,
      }),
      { read: closedRead, written: closedWritten },
    );
    samples.push({
      elapsedSeconds: (Date.now() - started) / 1000,
      phase,
      rss: memory.rss,
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
      external: memory.external,
      cpuMicros: cpu.user + cpu.system,
      maxRssBytes: process.resourceUsage().maxRSS * 1024,
      linuxHighWaterBytes,
      tcpReadBytes: io.read,
      tcpWrittenBytes: io.written,
      openTcpSockets: sockets.size,
      logBytes,
      counters: processMetrics(),
    });
    if (samples.length > 7200) samples.shift();
    writeFileSync(
      path,
      JSON.stringify(
        {
          startedAt: new Date(started).toISOString(),
          measuredAt: new Date().toISOString(),
          arch: process.arch,
          node: process.version,
          sampleIntervalSeconds: 5,
          scope:
            "Single Node worker process; excludes tsx loader helper, Docker/OS and provider billing. TCP socket bytes are an approximation, not billed network usage. No API response or SQL text stored.",
          samples,
        },
        null,
        2,
      ),
    );
  }
  sample();
  const timer = setInterval(sample, 5000);
  return {
    phase: (name: string) => {
      phase = name;
    },
    stop: () => {
      clearInterval(timer);
      sample();
      channel("net.client.socket").unsubscribe(subscriber);
      process.stdout.write = originalWrite;
      process.stderr.write = originalError;
      console.log(JSON.stringify({ event: "profile_saved", path }));
    },
  };
}
