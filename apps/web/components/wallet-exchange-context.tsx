import Link from "next/link";
import { sqlClient } from "@flownix/db";
import {
  exchangeLabelFromRow,
  walletExchangeResearch,
  tokenVisual,
  tokenUnits,
  explorerUrl,
  type Transfer,
} from "@flownix/core";
import { TokenIdentity } from "./token-identity";
import { iso } from "../lib/data";

export async function WalletExchangeContext({
  chain,
  address,
  transfers,
  truncated,
}: {
  chain: string;
  address: string;
  transfers: Record<string, unknown>[];
  truncated: boolean;
}) {
  if (chain === "CT_501") return null;
  const sql = sqlClient(),
    asOf = new Date().toISOString();
  const [monitors, labels, visits, caseStudy] = await Promise.all([
    sql`SELECT m.*,to_jsonb(t) AS identity,b.first_time,b.last_time,b.first_raw,b.last_raw,
      (SELECT count(*)::int FROM scan_windows w WHERE w.token_id=m.token_id) AS sampled_windows,
      (SELECT count(*)::int FROM scan_gap_observations g WHERE g.token_id=m.token_id) AS gaps
      FROM wallet_monitoring m JOIN alpha_tokens t ON t.id=m.token_id AND t.chain_id=m.chain_id
      LEFT JOIN LATERAL(SELECT min(block_time) AS first_time,max(block_time) AS last_time,
        (array_agg(raw_quantity::text ORDER BY block_number))[1] AS first_raw,
        (array_agg(raw_quantity::text ORDER BY block_number DESC))[1] AS last_raw
        FROM wallet_balance_snapshots s WHERE s.token_id=m.token_id AND s.chain_id=m.chain_id AND s.address=m.address AND s.canonical) b ON true
      WHERE m.chain_id=${chain} AND m.address=${address} ORDER BY m.active DESC,m.added_at LIMIT 100`,
    sql`SELECT l.* FROM wallet_labels l WHERE l.chain_id=${chain} AND (l.address=${address} OR EXISTS(SELECT 1 FROM token_transfers e WHERE e.chain_id=${chain} AND e.canonical AND (e.from_address=${address} OR e.to_address=${address}) AND (e.from_address=l.address OR e.to_address=l.address))) ORDER BY l.created_at,l.id`,
    sql`SELECT t.id,t.chain_id,t.symbol,t.contract,count(*)::int AS events FROM token_transfers e JOIN alpha_tokens t ON t.id=e.token_id AND t.chain_id=e.chain_id WHERE e.canonical AND (e.from_address=${address} OR e.to_address=${address}) GROUP BY t.id ORDER BY t.chain_id,t.symbol LIMIT 100`,
    sql`SELECT computed_at,evidence FROM research_feature_snapshots WHERE kind='wallet_exchange_case' AND evidence->>'address'=${address} AND evidence ? 'eventStudies' ORDER BY computed_at DESC LIMIT 1`,
  ]);
  const tokens = new Map<string, Record<string, unknown>>();
  for (const t of transfers)
    tokens.set(String(t.token_id), t.token_identity as Record<string, unknown>);
  for (const m of monitors) tokens.set(String(m.token_id), m.identity);
  const reports = [...tokens.values()].map((t) =>
    walletExchangeResearch({
      token: {
        id: String(t.id),
        chain: String(t.chain_id),
        contract: String(t.contract),
      },
      address,
      asOf,
      truncated,
      labels: labels.map(exchangeLabelFromRow),
      transfers: transfers.map((e) => ({
        chain: String(e.chain_id),
        tokenId: String(e.token_id),
        txHash: String(e.tx_hash),
        logIndex: Number(e.log_index),
        blockNumber: Number(e.block_number),
        blockHash: String(e.block_hash),
        eventTime: new Date(e.event_time as string).toISOString(),
        availableAt: new Date(e.available_at as string).toISOString(),
        from: String(e.from_address),
        to: String(e.to_address),
        rawQuantity: String(e.raw_quantity),
        decimals: Number(e.decimals),
        kind: e.kind as Transfer["kind"],
        source: String(e.source),
      })),
    }),
  );
  return (
    <section className="workbench" aria-labelledby="wallet-exchange-heading">
      <div className="section-top">
        <h2 id="wallet-exchange-heading">
          Monitored Alpha tokens & exchange flows
        </h2>
        <span>Partial local evidence</span>
      </div>
      <div className="panel-content">
        <p>
          Exchange withdrawals are received transfers; deposits are sent
          transfers. Neither establishes a purchase, sale, acquisition cost or
          beneficial ownership. Budget mode cannot provide real-time wallet
          alerts between collection windows.
        </p>
        <p className="muted">
          Flow timeline: latest {transfers.length} canonical observations
          {truncated ? "; older rows omitted" : "; full history unavailable"}.
          Label review time is separate from transaction time. Later labels are
          retrospective context.
        </p>
        {!monitors.length ? (
          <p>
            No wallet monitoring rows exist on this chain. Historical
            observations alone do not enable future balance monitoring.
          </p>
        ) : null}
      </div>
      {monitors.length ? (
        <div
          className="table-scroll"
          role="region"
          aria-label="Monitored Alpha wallet tokens"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th>Alpha token</th>
                <th>Monitoring / coverage</th>
                <th>First / latest observed balance</th>
              </tr>
            </thead>
            <tbody>
              {monitors.map((m) => (
                <tr key={m.token_id}>
                  <td>
                    <TokenIdentity token={tokenVisual(m.identity)} />
                  </td>
                  <td>
                    {m.active ? "Active investigation" : "Inactive"}
                    <small>{m.reason}</small>
                    <small>
                      {m.sampled_windows} token scan windows / {m.gaps} recorded
                      gaps; no full wallet history
                    </small>
                  </td>
                  <td>
                    {m.first_raw === null ? (
                      "Unavailable"
                    ) : (
                      <>
                        <code>{m.first_raw}</code>
                        <small>{iso(m.first_time)} / first sample</small>
                        <code>{m.last_raw}</code>
                        <small>
                          {iso(m.last_time)} / latest sample, raw atomic units
                        </small>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {reports.map((report) => (
        <div className="panel-content" key={report.tokenId}>
          <h3>
            <Link href={`/token/${report.tokenId}`}>
              {String(tokens.get(report.tokenId)?.symbol)}
            </Link>{" "}
            / exchange transfer sample
          </h3>
          <p>
            Reviewed-address withdrawals:{" "}
            {report.observedWithdrawalRaw ?? "Unavailable"}; deposits:{" "}
            {report.observedDepositRaw ?? "Unavailable"}; net received:{" "}
            {report.observedNetReceivedRaw ?? "Unavailable"} (raw atomic units).{" "}
            {report.distinctReturnTransactions} observed return transactions
            matched by FIFO; no profit or retention inference.
          </p>
          {report.events.length ? (
            <div
              className="table-scroll"
              role="region"
              aria-label={`${String(tokens.get(report.tokenId)?.symbol)} exchange transfer timeline`}
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th>Transaction / time</th>
                    <th>Direction / token units</th>
                    <th>Counterparty evidence</th>
                    <th>Availability</th>
                  </tr>
                </thead>
                <tbody>
                  {report.events.toReversed().map((e) => (
                    <tr key={e.eventId}>
                      <td>
                        <a
                          href={explorerUrl(chain, "tx", e.txHash)!}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {e.txHash.slice(0, 14)}…
                        </a>
                        <small>{iso(e.at)}</small>
                      </td>
                      <td>
                        {e.attribution === "provisional" ? "Possible " : ""}
                        {e.exchangeDirection?.replaceAll("_", " ") ??
                          e.direction.replaceAll("_", " ")}
                        <small>{tokenUnits(e.raw, e.decimals)}</small>
                      </td>
                      <td>
                        <Link href={`/wallet/${chain}/${e.counterparty}`}>
                          {e.counterparty.slice(0, 14)}…
                        </Link>
                        <small>
                          {e.entity ?? "Unknown entity"} / {e.attribution} /{" "}
                          {e.accountRole}
                        </small>
                        {e.source ? (
                          <a href={e.source} target="_blank" rel="noreferrer">
                            Label source
                          </a>
                        ) : null}
                      </td>
                      <td>
                        {iso(e.availableAt)}
                        <small>
                          Label {iso(e.labelAvailableAt)} /{" "}
                          {e.labelKnownAtEvent
                            ? "known by event time"
                            : "not known at event time"}
                        </small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>
              No canonical transfers in this sample. Zero activity is not
              established.
            </p>
          )}
        </div>
      ))}
      {Array.isArray(caseStudy[0]?.evidence.eventStudies) ? (
        <div className="panel-content">
          <h3>Fixed-horizon historical studies</h3>
          <p className="muted">
            Computed {iso(caseStudy[0].computed_at)}. Controls are selected from
            point-in-time membership, liquidity, chain, age and coverage before
            reading outcomes. A matched control is not automatically a failed
            opportunity.
          </p>
          {caseStudy[0].evidence.eventStudies.map(
            (s: {
              eventId: string;
              anchor: string;
              controls: {
                selected: { tokenId: string; projectKey: string }[];
                suppressed: string | null;
              };
              outcomes: {
                tokenId: string;
                outcomes?: {
                  days: number;
                  status: string;
                  returnPct: string | null;
                }[];
              }[];
            }) => (
              <article key={s.eventId}>
                <p>
                  Event {iso(s.anchor)} / {s.controls.selected.length} matched
                  controls.{" "}
                  {s.controls.suppressed ?? "No future-return filter used."}
                </p>
                {s.controls.selected.length ? (
                  <p>
                    Controls:{" "}
                    {s.controls.selected.map((c) => (
                      <Link key={c.tokenId} href={`/token/${c.tokenId}`}>
                        {c.projectKey}{" "}
                      </Link>
                    ))}
                  </p>
                ) : null}
                <ul>
                  {s.outcomes.map((o) => (
                    <li key={o.tokenId}>
                      <Link href={`/token/${o.tokenId}`}>
                        {o.tokenId.slice(0, 12)}…
                      </Link>
                      :{" "}
                      {o.outcomes
                        ?.map(
                          (r) =>
                            `${r.days}d ${r.status}${r.returnPct === null ? "" : ` (${r.returnPct}%)`}`,
                        )
                        .join("; ") ?? "Exact market baseline unavailable"}
                    </li>
                  ))}
                </ul>
                <p>
                  Retrospective evidence only; executable profit and strategy
                  validity are not established.
                </p>
              </article>
            ),
          )}
        </div>
      ) : null}
      <div className="panel-content">
        <h3>Observed across Alpha identities</h3>
        {visits.length ? (
          <ul>
            {visits.map((t) => (
              <li key={t.id}>
                <Link href={`/token/${t.id}`}>{t.symbol}</Link> / chain{" "}
                {t.chain_id} / <code>{t.contract}</code> / {t.events} canonical
                transfer observations
              </li>
            ))}
          </ul>
        ) : (
          <p>No cross-token transfer evidence yet.</p>
        )}
      </div>
    </section>
  );
}
