import { sqlClient, settingsValue } from "@flownix/db";
import { config, defaultSignalConfig, freshness } from "@flownix/core";
import { health, iso } from "../../../lib/data";
import { requireAccess } from "../../../lib/auth";
import { ActionButton } from "../../../components/controls";
import { MutationForm } from "../../../components/forms";
export const metadata = { title: "Settings and Data Health" };
export default async function Settings() {
  await requireAccess();
  const h = await health(),
    c = config();
  let thresholds = defaultSignalConfig,
    issues: Record<string, unknown>[] = [];
  try {
    thresholds = await settingsValue(
      "transfer_thresholds",
      defaultSignalConfig,
    );
    issues =
      await sqlClient()`SELECT provider,kind,detail,created_at FROM data_quality_issues ORDER BY created_at DESC LIMIT 20`;
  } catch {
    /* setup state is rendered below */
  }
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings & Data Health</h1>
          <p>
            Collection status, known gaps, and the cost of every observation.
          </p>
        </div>
        <ActionButton className="primary" payload={{ action: "sync" }}>
          Queue registry sync
        </ActionButton>
      </div>
      <div className="status-strip">
        <span className={h.database ? "positive" : "warning"}>
          PostgreSQL {h.database ? "connected" : "unavailable"}
        </span>
        <span>
          Registry count <strong>{h.registry?.count ?? "Unverified"}</strong>
        </span>
        <span
          className={
            h.heartbeat &&
            !h.heartbeat.stopped &&
            freshness(h.heartbeat.at, Date.now(), 90) === "current"
              ? "positive"
              : "warning"
          }
        >
          Worker{" "}
          {h.heartbeat &&
          !h.heartbeat.stopped &&
          freshness(h.heartbeat.at, Date.now(), 90) === "current"
            ? "current"
            : "offline / unverified"}
        </span>
        <span>
          24h estimated paid cost{" "}
          <strong>
            {h.providers.reduce((s, p) => s + Number(p.cost), 0).toFixed(2)} USD
          </strong>
        </span>
      </div>
      {!h.database ? (
        <div className="notice">
          <strong>Connect PostgreSQL to begin</strong>
          <p>{h.error}</p>
          <pre>
            cp .env.example .env
            <br />
            docker compose up -d
            <br />
            pnpm db:migrate
            <br />
            pnpm worker:dev
            <br />
            pnpm run doctor
          </pre>
        </div>
      ) : null}
      <section className="workbench">
        <div className="section-top">
          <h2>Broad Alpha market coverage</h2>
          <span>Official Alpha tickers only; DEX quotes remain separate</span>
        </div>
        <div className="status-strip">
          <span><strong>{h.market.freshPrices}</strong> fresh prices</span>
          <span><strong>{h.market.eligiblePairs}</strong> active pair identities</span>
          <span><strong>{h.market.pending}</strong> pending</span>
          <span><strong>{h.market.missingPair}</strong> without an active pair</span>
          <span><strong>{h.market.errors}</strong> provider errors</span>
          <span><strong>{h.market.registryPrices}</strong> registry metadata prices</span>
        </div>
        <div className="panel-content">
          <p>Latest official Alpha ticker observed: {iso(h.market.at)}. Latest market cycle: {h.market.lastCycle ? JSON.stringify(h.market.lastCycle) : "not observed"}.</p>
          <p className="muted">Coverage rotates up to {c.MARKET_TOKEN_LIMIT} token identities per worker cycle, independently of the {c.DEEP_TOKEN_LIMIT} deep-research selection. Fresh means an observation within 15 minutes. Price, volume and quote currency are retained as returned by the official Alpha pair. Registry prices have no assumed quote currency. DEX prices and Alpha ticker prices remain separate sources.</p>
        </div>
      </section>
      <section className="workbench">
        <div className="section-top">
          <h2>Provider operations</h2>
          <span>Calls over the past 24 hours</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Last successful observation</th>
                <th>State</th>
                <th>Calls / failed</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {h.providers.map((p) => (
                <tr key={p.provider}>
                  <td>{p.provider}</td>
                  <td>{iso(p.last_ok)}</td>
                  <td
                    className={
                      freshness(p.last_ok) === "current"
                        ? "positive"
                        : "warning"
                    }
                  >
                    {freshness(p.last_ok)}
                  </td>
                  <td>
                    {p.calls} / {p.failures}
                  </td>
                  <td>{p.cost} USD</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!h.providers.length ? (
            <div className="empty">
              <p>
                No provider calls recorded. Run the persistent worker or the
                provider smoke check.
              </p>
            </div>
          ) : null}
        </div>
        <div className="panel-content">
          <p>
            Last registry sync: {iso(h.registry?.at)}. Last heartbeat:{" "}
            {iso(h.heartbeat?.at)}.
          </p>
          {h.changes ? (
            <p>
              Latest reconciliation: {h.changes.added?.length ?? 0} added,{" "}
              {h.changes.removed?.length ?? 0} removed,{" "}
              {h.changes.offline?.length ?? 0} offline,{" "}
              {h.changes.unknown?.length ?? 0} unknown status.
            </p>
          ) : null}
          <p className="muted">
            Provider failures retain older observations. Current means recently
            observed; it does not imply a streaming connection.
          </p>
        </div>
      </section>
      <section className="workbench">
        <div className="section-top">
          <h2>Network capability matrix</h2>
          <span>Derived from the observed registry</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Network</th>
                <th>All observed / current</th>
                <th>Selected / scanned</th>
                <th>Transfer capability</th>
                <th>Verified buys / holders</th>
                <th>Last scan</th>
              </tr>
            </thead>
            <tbody>
              {h.chains.map((ch) => (
                <tr key={ch.chain_id}>
                  <td>
                    {ch.chain_name} · chain ID {ch.chain_id}
                  </td>
                  <td>{ch.tokens} / {ch.active}</td>
                  <td>
                    {ch.deep} / {ch.scanned}
                  </td>
                  <td>
                    {["56", "1", "8453"].includes(ch.chain_id)
                      ? ch.scanned
                        ? "Confirmed RPC log observations"
                        : "EVM adapter; runtime not verified"
                      : "Not available on this chain"}
                  </td>
                  <td>Unavailable / partial samples only</td>
                  <td>{iso(ch.last_scan)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!h.chains.length ? (
            <div className="empty">
              <p>
                Networks will appear after a successful official registry sync.
                EVM adapters exist for BSC, Ethereum and Base; no network
                ingestion is claimed until scanned.
              </p>
            </div>
          ) : null}
        </div>
      </section>
      <div className="two-column">
        <section className="workbench">
          <div className="section-top">
            <h2>Experimental transfer thresholds</h2>
          </div>
          <div className="panel-content">
            <MutationForm actionName="thresholds">
              <div className="form-grid">
                <label>
                  Minimum transfer events
                  <input
                    name="minEvents"
                    type="number"
                    min="5"
                    max="100000"
                    defaultValue={thresholds.minEvents}
                    required
                  />
                </label>
                <label>
                  Baseline multiplier
                  <input
                    name="multiplier"
                    type="number"
                    min="2"
                    max="100"
                    step="0.1"
                    defaultValue={thresholds.multiplier}
                    required
                  />
                </label>
                <label>
                  Complete baseline windows
                  <input
                    name="baselineWindows"
                    type="number"
                    min="6"
                    max="100"
                    defaultValue={thresholds.baselineWindows}
                    required
                  />
                </label>
                <label>
                  Minimum registry liquidity
                  <input
                    name="minLiquidity"
                    type="number"
                    min="10000"
                    max="1000000000000"
                    defaultValue={thresholds.minLiquidity}
                    required
                  />
                </label>
              </div>
              <p className="muted">
                Versioned experimental defaults, not empirically optimized. No
                transfer threshold confirms accumulation. Max data age{" "}
                {c.MAX_DATA_AGE_SECONDS}s; cooldown {c.SIGNAL_COOLDOWN_MINUTES}{" "}
                minutes.
              </p>
            </MutationForm>
          </div>
        </section>
        <section className="workbench">
          <div className="section-top">
            <h2>Notifications and API budget</h2>
          </div>
          <div className="panel-content">
            <dl className="facts">
              <div>
                <dt>In-app alerts</dt>
                <dd>Available without external credentials</dd>
              </div>
              <div>
                <dt>Telegram</dt>
                <dd>
                  {c.TELEGRAM_ENABLED &&
                  c.TELEGRAM_BOT_TOKEN &&
                  c.TELEGRAM_CHAT_ID
                    ? "Configured; delivery needs a receipt"
                    : "Not configured"}
                </dd>
              </div>
              <div>
                <dt>Telegram scope</dt>
                <dd>
                  {c.TELEGRAM_WATCHLIST_ONLY ? "Watchlist only" : "Alpha-wide"}
                </dd>
              </div>
              <div>
                <dt>Paid enrichment</dt>
                <dd>Disabled adapter; no paid calls</dd>
              </div>
              <div>
                <dt>Daily hard cap</dt>
                <dd>{c.PAID_DAILY_BUDGET_USD} USD</dd>
              </div>
              <div>
                <dt>Wallet labels</dt>
                <dd>Unknown unless evidence is supplied</dd>
              </div>
            </dl>
            <div className="row">
              <ActionButton
                payload={{ action: "notification_test", channel: "in_app" }}
              >
                Test in-app
              </ActionButton>
              <ActionButton
                payload={{ action: "notification_test", channel: "telegram" }}
              >
                Test Telegram
              </ActionButton>
            </div>
            <p className="muted">
              Credentials stay in server environment variables. No browser
              configuration accepts provider URLs or secret values.
            </p>
          </div>
        </section>
      </div>
      <section className="workbench">
        <div className="section-top">
          <h2>Persistent collector queue</h2>
          <span>One worker / bounded concurrency</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Job</th>
                <th>Status</th>
                <th>Next run</th>
                <th>Attempts / error</th>
              </tr>
            </thead>
            <tbody>
              {h.jobs.map((j) => (
                <tr key={j.key}>
                  <td>
                    {j.kind}
                    <small>{j.key}</small>
                  </td>
                  <td>{j.status}</td>
                  <td>{iso(j.run_after)}</td>
                  <td>
                    {j.attempts} / {j.last_error ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="workbench">
        <div className="section-top">
          <h2>Data quality log</h2>
        </div>
        <div className="panel-content">
          {issues.length ? (
            issues.map((i, idx) => (
              <p key={idx}>
                {iso(i.created_at)} / {String(i.provider)} / {String(i.kind)}:{" "}
                {String(i.detail)}
              </p>
            ))
          ) : (
            <p>
              No data quality issues have been recorded. This is not a guarantee
              of complete coverage.
            </p>
          )}
          <details>
            <summary>Troubleshooting and deployment</summary>
            <p>
              Use pnpm run doctor and pnpm providers:smoke from the project
              root. Configure a direct Postgres connection for the worker, and a
              pooled connection for a serverless web deployment. Run migrations
              before starting services. The continuous collector must run on
              WSL, a VPS or another persistent service; Vercel hosts only the
              web app.
            </p>
            <p>
              Remote deployments require ACCESS_MODE=oauth, GitHub OAuth
              credentials, GITHUB_ALLOWED_LOGIN, NEXTAUTH_URL and a strong
              NEXTAUTH_SECRET. Local mode binds to 127.0.0.1 and is denied in
              production.
            </p>
          </details>
        </div>
      </section>
    </>
  );
}
