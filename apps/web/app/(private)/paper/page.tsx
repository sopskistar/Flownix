import type { DbRows } from "../../../lib/data";
import Link from "next/link";
import { sqlClient } from "@flownix/db";
import { requireAccess } from "../../../lib/auth";
import { safeRadar, iso, num } from "../../../lib/data";
import { PaperEntry } from "../../../components/forms";
import { ActionButton } from "../../../components/controls";
export const metadata = { title: "Performance Lab" };
export default async function Paper() {
  await requireAccess();
  const tokens = await safeRadar();
  let trades: DbRows = [],
    outcomes: DbRows = [];
  try {
    trades =
      await sqlClient()`SELECT p.*,t.symbol FROM paper_trades p JOIN alpha_tokens t ON t.id=p.token_id ORDER BY p.created_at DESC LIMIT 100`;
    outcomes =
      await sqlClient()`SELECT o.*,t.symbol FROM signal_outcomes o JOIN signal_events s ON s.id=o.signal_id JOIN alpha_tokens t ON t.id=s.token_id ORDER BY o.computed_at DESC LIMIT 100`;
  } catch {
    trades = [];
    outcomes = [];
  }
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Performance Lab</h1>
          <p>
            Conservative paper experiments, genuine outcomes, and unresolved
            hypotheses.
          </p>
        </div>
        <div className="row">
          <Link className="button" href="/api/export?kind=paper">
            Export paper trades
          </Link>
          <Link className="button" href="/api/export?kind=outcomes">
            Export outcomes
          </Link>
        </div>
      </div>
      <div className="notice">
        <strong>Simulation only</strong>
        <p>
          Entries require a fresh observed Alpha ask with sufficient displayed
          size, and exits require a bid. They are book-quote simulations;
          displayed liquidity can disappear. Minimum liquidity 100,000 registry
          units, maximum position 0.1% of displayed ask notional, per-trade
          exposure 10%, aggregate exposure 50%. Quote assets remain separate; no
          assumed USD parity.
        </p>
      </div>
      <section className="workbench">
        <div className="section-top">
          <h2>Record a paper entry</h2>
          <span>No trading credentials or live orders</span>
        </div>
        <div className="panel-content">
          <PaperEntry tokens={tokens.filter((t) => t.status === "current")} />
        </div>
      </section>
      <section className="workbench">
        <div className="section-top">
          <h2>Paper ledger</h2>
          <span>{trades.length} recorded entries</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Token</th>
                <th>Entry (UTC)</th>
                <th>Price / quote</th>
                <th>Notional</th>
                <th>Status</th>
                <th>Realized simulation P&amp;L</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link href={`/token/${t.token_id}`}>{t.symbol}</Link>
                  </td>
                  <td>{iso(t.entry_at)}</td>
                  <td>
                    {num(t.entry_price, 8)} {t.quote_asset}
                  </td>
                  <td>{num(t.notional)}</td>
                  <td>{t.status}</td>
                  <td>
                    {t.net_pnl === null
                      ? "Unavailable"
                      : `${num(t.net_pnl, 4)} ${t.quote_asset}`}
                  </td>
                  <td>
                    {t.status === "open" ? (
                      <ActionButton
                        payload={{ action: "paper_exit", tradeId: t.id }}
                      >
                        Close at fresh quote
                      </ActionButton>
                    ) : (
                      iso(t.exit_at)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!trades.length ? (
            <div className="empty">
              <h3>No paper entries yet</h3>
              <p>
                An entry requires a fresh real Alpha order-book quote. Past
                peaks and later prices cannot fill an earlier order.
              </p>
            </div>
          ) : null}
        </div>
      </section>
      <section className="workbench">
        <div className="section-top">
          <h2>Forward outcome research</h2>
          <span>1h, 4h, 24h, 72h / 7, 14, 30, 60, 90 days</span>
        </div>
        {outcomes.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Horizon</th>
                  <th>Gross %</th>
                  <th>Estimated net %</th>
                  <th>MFE / MAE %</th>
                  <th>Computed</th>
                </tr>
              </thead>
              <tbody>
                {outcomes.map((o) => (
                  <tr key={`${o.signal_id}:${o.horizon_hours}`}>
                    <td>{o.symbol}</td>
                    <td>{o.horizon_hours}h</td>
                    <td>{o.evidence.grossReturnPct}</td>
                    <td>{o.evidence.netReturnPct}</td>
                    <td>
                      {o.evidence.mfePct} / {o.evidence.maePct}
                    </td>
                    <td>{iso(o.computed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h3>Outcomes are not yet knowable</h3>
            <p>
              No sufficient signal and completed candle history is stored. Win
              rate, profit factor, lead time, drawdown, precision/recall and
              Alpha baseline comparisons remain unavailable. No fabricated
              return series is displayed.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
