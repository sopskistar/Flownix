import { mkdir, writeFile } from "node:fs/promises";
const base = "https://www.binance.com";
const routes = {
  registry:
    "/bapi/defi/v1/public/wallet-direct/buw/wallet/cex/alpha/all/token/list",
  exchange: "/bapi/defi/v1/public/alpha-trade/get-exchange-info",
};
await mkdir("artifacts/smoke", { recursive: true });
const report = { checkedAt: new Date().toISOString(), results: {} };
for (const [name, path] of Object.entries(routes)) {
  try {
    const r = await fetch(base + path, {
      signal: AbortSignal.timeout(20000),
      redirect: "error",
    });
    const raw = await r.text();
    await writeFile(`artifacts/smoke/${name}.json`, raw);
    const body = JSON.parse(raw);
    if (!r.ok || body.code !== "000000" || body.success === false)
      throw Error(`HTTP ${r.status}, code ${body.code}`);
    report.results[name] = {
      ok: true,
      http: r.status,
      date: r.headers.get("date"),
      count: Array.isArray(body.data)
        ? body.data.length
        : body.data?.symbols?.length,
      keys: Object.keys(
        Array.isArray(body.data) ? (body.data[0] ?? {}) : (body.data ?? {}),
      ),
      rateLimits: body.data?.rateLimits,
    };
  } catch (e) {
    report.results[name] = { ok: false, error: e.cause?.code ?? e.message };
  }
}
await writeFile("artifacts/smoke/report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (Object.values(report.results).some((x) => !x.ok)) process.exitCode = 1;
