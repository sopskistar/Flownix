import { readdir, readFile, writeFile } from "node:fs/promises";
type Sample = {
  elapsedSeconds: number;
  phase: string;
  rss: number;
  heapUsed: number;
  cpuMicros: number;
  linuxHighWaterBytes?: number | null;
  tcpReadBytes: number;
  tcpWrittenBytes: number;
  logBytes: number;
  openTcpSockets: number;
  counters: Record<string, number>;
};
const reports = [];
for (const file of (await readdir("artifacts/profiles"))
  .filter((f) => f.endsWith(".json"))
  .sort()) {
  const raw = JSON.parse(
    await readFile(`artifacts/profiles/${file}`, "utf8"),
  ) as {
    startedAt: string;
    measuredAt: string;
    arch: string;
    node: string;
    samples: Sample[];
  };
  const samples = raw.samples,
    last = samples.at(-1)!;
  let activeSeconds = 0,
    cpuMicros = 0,
    maxCpu = 0,
    maxSampleGap = 0;
  const phases: Record<
    string,
    { seconds: number; cpuMicros: number; peakRssMiB: number }
  > = {};
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1],
      b = samples[i],
      dt = b.elapsedSeconds - a.elapsedSeconds,
      dcpu = b.cpuMicros - a.cpuMicros;
    maxSampleGap = Math.max(maxSampleGap, dt);
    if (dt <= 0 || dt > 15) continue; // Suspended terminal/host time is not representative idle CPU.
    activeSeconds += dt;
    cpuMicros += dcpu;
    maxCpu = Math.max(maxCpu, dcpu / dt / 10000);
    const p = (phases[a.phase] ??= { seconds: 0, cpuMicros: 0, peakRssMiB: 0 });
    p.seconds += dt;
    p.cpuMicros += dcpu;
    p.peakRssMiB = Math.max(p.peakRssMiB, b.rss / 1048576);
  }
  reports.push({
    file,
    startedAt: raw.startedAt,
    measuredAt: raw.measuredAt,
    arch: raw.arch,
    node: raw.node,
    samples: samples.length,
    elapsedSeconds: last.elapsedSeconds,
    activeSampleSeconds: activeSeconds,
    maxSampleGapSeconds: maxSampleGap,
    suspendedOrStalled: maxSampleGap > 15,
    meanSampleRssMiB:
      samples.reduce((n, s) => n + s.rss, 0) / samples.length / 1048576,
    peakSampleRssMiB: Math.max(...samples.map((s) => s.rss)) / 1048576,
    linuxHighWaterMiB:
      Math.max(0, ...samples.map((s) => s.linuxHighWaterBytes ?? 0)) /
        1048576 || null,
    peakHeapUsedMiB: Math.max(...samples.map((s) => s.heapUsed)) / 1048576,
    meanActiveSampleCpuPercent: activeSeconds
      ? cpuMicros / activeSeconds / 10000
      : null,
    peakIntervalCpuPercent: maxCpu,
    phases: Object.fromEntries(
      Object.entries(phases).map(([key, p]) => [
        key,
        {
          activeSeconds: p.seconds,
          meanCpuPercent: p.cpuMicros / p.seconds / 10000,
          peakRssMiB: p.peakRssMiB,
        },
      ]),
    ),
    tcpReadBytes: last.tcpReadBytes,
    tcpWrittenBytes: last.tcpWrittenBytes,
    logBytes: last.logBytes,
    peakTcpSockets: Math.max(...samples.map((s) => s.openTcpSockets)),
    counters: last.counters,
  });
}
const report = {
  generatedAt: new Date().toISOString(),
  scope:
    "Local Node-process measurements. No hosted worker, full production soak, 50-token or 100-token live benchmark. Socket counters approximate TCP traffic including PostgreSQL; billing differs. Large sampling gaps excluded from CPU averages. resourceUsage.maxRSS inherited before exec was 539 MiB even at startup; use Linux VmHWM where present and sampled RSS otherwise. Samples omit tsx helper, OS and Docker overhead. Database server CPU during writes was not measured.",
  runs: reports,
};
await writeFile(
  "docs/WORKER_RESOURCE_MEASUREMENTS.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
