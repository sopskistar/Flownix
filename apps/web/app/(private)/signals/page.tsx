import type { DbRows } from "../../../lib/data";
import Link from "next/link";
import { sqlClient } from "@flownix/db";
import { explorerUrl, tokenVisual } from "@flownix/core";
import { TokenIdentity } from "../../../components/token-identity";
import { requireAccess } from "../../../lib/auth";
import { iso, num } from "../../../lib/data";
import { ActionButton, ResearchNote } from "../../../components/controls";
export const metadata = { title: "Alerts and evidence" };
export default async function Signals({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAccess();
  const { status = "active" } = await searchParams;
  let signals: DbRows = [],
    notifications: DbRows = [];
  try {
    const sql = sqlClient();
    signals =
      await sql`SELECT s.*,t.symbol,t.chain_id,t.contract,to_jsonb(t) AS token_identity FROM signal_events s JOIN alpha_tokens t ON t.id=s.token_id WHERE s.status=${status} ORDER BY first_detected_at DESC LIMIT 100`;
    notifications =
      await sql`SELECT * FROM notification_deliveries ORDER BY created_at DESC LIMIT 20`;
  } catch {
    signals = [];
    notifications = [];
  }
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Alerts & evidence</h1>
          <p>
            Material changes, exact first detection, and the observations behind
            them.
          </p>
        </div>
        <Link className="button" href="/api/export?kind=signals">
          Export signals
        </Link>
      </div>
      <div className="tabs">
        <Link
          href="/signals?status=active"
          aria-current={status === "active" ? "page" : undefined}
        >
          Active
        </Link>
        <Link
          href="/signals?status=dismissed"
          aria-current={status === "dismissed" ? "page" : undefined}
        >
          Dismissed
        </Link>
        <Link
          href="/signals?status=false_positive"
          aria-current={status === "false_positive" ? "page" : undefined}
        >
          False positives
        </Link>
        <Link
          href="/signals?status=reorg_invalidated"
          aria-current={status === "reorg_invalidated" ? "page" : undefined}
        >
          Reorg invalidated
        </Link>
      </div>
      {!signals.length ? (
        <div className="empty workbench">
          <h2>No {status.replaceAll("_", " ")} evidence alerts</h2>
          <p>
            Transfer detections require a current market observation and
            complete baseline scans. Accumulation alerts require a verified
            purchase ledger; unavailable inputs do not produce a bullish alert.
          </p>
          <ActionButton
            payload={{ action: "notification_test", channel: "in_app" }}
          >
            Test in-app notification
          </ActionButton>
        </div>
      ) : null}
      {await Promise.all(
        signals.map(async (s) => {
          const evidence =
            await sqlClient()`SELECT * FROM signal_evidence WHERE signal_id=${s.id}`;
          return (
            <section key={s.id} className="workbench">
              <div className="section-top">
                <h2>
                  <TokenIdentity token={tokenVisual(s.token_identity)} />
                  {s.kind.replaceAll("_", " ").toLowerCase()}
                </h2>
                <span className="tag">
                  {s.stage.toLowerCase()} / {s.evidence_confidence} confidence
                </span>
              </div>
              <div className="panel-content">
                <p>{s.message}</p>
                <div className="status-strip">
                  <span>First detected {iso(s.first_detected_at)}</span>
                  <span>
                    Price at detection {num(s.price_at_detection, 8)}{" "}
                    {s.quote_asset}
                  </span>
                  <span>Rule {s.rule_version}</span>
                </div>
                <details>
                  <summary>
                    Open evidence ({evidence.length} events) and thresholds
                  </summary>
                  <pre>
                    {JSON.stringify(
                      {
                        observed: s.observed,
                        thresholds: s.thresholds,
                        counterEvidence: s.counter_evidence,
                        dataAvailableAt: s.data_available_at,
                      },
                      null,
                      2,
                    )}
                  </pre>
                  <ul>
                    {evidence.slice(0, 50).map((e) => (
                      <li key={`${e.tx_hash}:${e.log_index}`}>
                        <a
                          href={explorerUrl(e.chain_id, "tx", e.tx_hash) ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {e.tx_hash} / log {e.log_index}
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
                <div className="row">
                  <ActionButton
                    payload={{
                      action: "signal_status",
                      signalId: s.id,
                      status: "dismissed",
                    }}
                  >
                    Dismiss
                  </ActionButton>
                  <ActionButton
                    payload={{
                      action: "signal_status",
                      signalId: s.id,
                      status: "false_positive",
                    }}
                  >
                    Annotate false positive
                  </ActionButton>
                </div>
                <ResearchNote tokenId={s.token_id} signalId={s.id} />
              </div>
            </section>
          );
        }),
      )}
      <section className="workbench">
        <div className="section-top">
          <h2>Notification delivery ledger</h2>
          <Link href="/settings">Configure notifications</Link>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Created</th>
                <th>Channel</th>
                <th>Status</th>
                <th>Receipt / message</th>
              </tr>
            </thead>
            <tbody>
              {notifications.map((n) => (
                <tr key={n.id}>
                  <td>{iso(n.created_at)}</td>
                  <td>{n.channel}</td>
                  <td>
                    {n.status} / {n.attempts} attempts
                  </td>
                  <td>
                    {n.receipt ??
                      n.error ??
                      n.payload.text ??
                      n.payload.kind ??
                      "In-app observation"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!notifications.length ? (
            <div className="empty">
              <p>
                No deliveries recorded. Test notifications are labelled and do
                not become research signals.
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
