import { mkdir, writeFile, readFile } from "node:fs/promises";
import { Resolver } from "node:dns/promises";
import {
  config,
  AlphaProvider,
  HttpClient,
  EvmProvider,
  evmChains,
  configuredEvmRpc,
  normalizeRegistry,
  ProviderError,
  networkErrorCode,
  dnsServers,
  closeProviderNetwork,
} from "../packages/core/src/index";
import {
  sqlClient,
  closeDb,
  auditRequest,
  saveSource,
  jsonParam,
  setSetting,
} from "../packages/db/src/index";

const persist = process.argv.includes("--persist");
if (persist && process.env.DATABASE_URL_WORKER)
  process.env.DATABASE_URL = process.env.DATABASE_URL_WORKER;
const report: Record<string, unknown> = {
  checkedAt: new Date().toISOString(),
  environment: process.env.VERCEL
    ? "vercel"
    : (process.env.WORKER_PLATFORM ?? "local"),
  node: process.version,
  processLocalDns: dnsServers(),
  tlsVerification: true,
  results: {},
  chains: [],
};
const results = report.results as Record<string, unknown>;
const audit = persist ? auditRequest : async () => {};
const error = (e: unknown) => ({
  ok: false,
  code: e instanceof ProviderError ? e.code : networkErrorCode(e),
  http: e instanceof ProviderError ? e.status : null,
});
try {
  await mkdir("artifacts/smoke", { recursive: true });
  const system = new Resolver({ timeout: 2500, tries: 1 });
  try {
    await system.resolve4("www.binance.com");
    report.systemDns = { ok: true };
  } catch (e) {
    report.systemDns = error(e);
  }
  try {
    const wsl = await readFile("/proc/sys/kernel/osrelease", "utf8");
    report.wsl = /microsoft/i.test(wsl);
  } catch {
    report.wsl = false;
  }
  const alpha = new AlphaProvider(
    new HttpClient("binance_alpha", config().ALPHA_REQUESTS_PER_MINUTE, audit),
  );
  try {
    const o = await alpha.registry(),
      rows = normalizeRegistry(o.data);
    await writeFile("artifacts/smoke/registry.json", o.raw);
    if (persist) await saveSource("binance_alpha", o);
    results.registry = {
      ok: true,
      source: o.source,
      observedAt: o.observedAt,
      serverDate: o.serverDate,
      responseHash: o.hash,
      responseCount: o.data.length,
      identities: rows.length,
      current: rows.filter((t) => t.status === "current").length,
      offline: rows.filter((t) => t.status === "offline").length,
      chains: Object.fromEntries(
        [...new Set(rows.map((t) => t.chainId))].map((chain) => [
          chain,
          rows.filter((t) => t.chainId === chain).length,
        ]),
      ),
    };
  } catch (e) {
    results.registry = error(e);
  }
  try {
    const o = await alpha.exchange();
    await writeFile("artifacts/smoke/exchange.json", o.raw);
    if (persist) await saveSource("binance_alpha", o);
    results.exchange = {
      ok: true,
      source: o.source,
      observedAt: o.observedAt,
      responseHash: o.hash,
      symbols: o.data.symbols.length,
      quotes: [...new Set(o.data.symbols.map((s) => s.quoteAsset))],
      rateLimits: o.data.rateLimits ?? null,
      serverTime: o.data.serverTime ?? null,
    };
  } catch (e) {
    results.exchange = error(e);
  }
  if (process.argv.includes("--rpc"))
    for (const [chain, info] of Object.entries(evmChains)) {
      try {
        const rpc = new EvmProvider(
          chain,
          process.env[info.env] ?? configuredEvmRpc(chain),
          new HttpClient(`rpc:${chain}`, 30, audit),
        );
        const head = await rpc.head(),
          block = await rpc.block(head - config().SCAN_CONFIRMATIONS),
          historic = await rpc.block(Math.max(0, head - 1000));
        if (persist) {
          await saveSource(`rpc:${chain}`, block);
          await saveSource(`rpc:${chain}`, historic);
        }
        (report.chains as unknown[]).push({
          chain,
          name: info.name,
          ok: true,
          head,
          confirmedBlock: Number(BigInt(block.data.number)),
          confirmedHash: block.data.hash,
          confirmedTime: new Date(
            Number(BigInt(block.data.timestamp)) * 1000,
          ).toISOString(),
          historicBlock: Number(BigInt(historic.data.number)),
          historicHash: historic.data.hash,
          source: block.source,
          tokenLevelIngestion: false,
          limitation:
            "Connectivity and sampled historical blocks only; token scans have a separate live gate",
        });
      } catch (e) {
        (report.chains as unknown[]).push({
          chain,
          name: info.name,
          ...error(e),
        });
      }
    }
  if (persist) {
    await sqlClient()`INSERT INTO provider_diagnostics(environment,checked_at,report) VALUES(${String(report.environment)},${String(report.checkedAt)},${jsonParam(report)}::jsonb)`;
    await setSetting("provider_diagnostics", report);
  }
  await writeFile(
    "artifacts/smoke/report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  if (
    Object.values(results).some((r) => !(r as { ok: boolean }).ok) ||
    (report.chains as { ok: boolean }[]).some((r) => !r.ok)
  )
    process.exitCode = 1;
} catch (e) {
  console.error(JSON.stringify({ diagnosticsFailed: true, ...error(e) }));
  process.exitCode = 1;
} finally {
  await closeDb();
  await closeProviderNetwork();
}
