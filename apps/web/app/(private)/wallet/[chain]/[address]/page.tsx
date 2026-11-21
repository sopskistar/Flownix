import Link from "next/link";
import { notFound } from "next/navigation";
import { sqlClient } from "@flownix/db";
import {
  isEvmAddress,
  evmChains,
  explorerUrl,
  tokenUnits,
  tokenVisual,
} from "@flownix/core";
import { requireAccess } from "../../../../../lib/auth";
import { iso, num } from "../../../../../lib/data";
import { CopyAddress, ResearchNote } from "../../../../../components/controls";
import { MutationForm } from "../../../../../components/forms";
import { TokenIdentity } from "../../../../../components/token-identity";
export const metadata = { title: "Wallet Detective" };
export default async function Wallet({
  params,
}: {
  params: Promise<{ chain: string; address: string }>;
}) {
  await requireAccess();
  const { chain, address: input } = await params;
  if (!evmChains[chain] || !isEvmAddress(input)) notFound();
  const address = input.toLowerCase(),
    sql = sqlClient();
  const [transfers, balances, labels, notes] = await Promise.all([
    sql`SELECT e.*,t.symbol,to_jsonb(t) AS token_identity FROM token_transfers e JOIN alpha_tokens t ON t.id=e.token_id WHERE e.chain_id=${chain} AND (from_address=${address} OR to_address=${address}) AND e.canonical ORDER BY event_time DESC LIMIT 100`,
    sql`SELECT DISTINCT ON (b.token_id) b.*,t.symbol,to_jsonb(t) AS token_identity,t.metadata->>'decimals' AS decimals FROM wallet_balance_snapshots b JOIN alpha_tokens t ON t.id=b.token_id WHERE b.chain_id=${chain} AND b.address=${address} AND b.canonical ORDER BY b.token_id,b.observed_at DESC`,
    sql`SELECT * FROM wallet_labels WHERE chain_id=${chain} AND address=${address} ORDER BY created_at DESC`,
    sql`SELECT * FROM manual_research_notes WHERE chain_id=${chain} AND address=${address} ORDER BY created_at DESC LIMIT 50`,
  ]);
  return (
    <>
      <div className="breadcrumbs">
        <Link href="/clusters">Wallet Intelligence</Link>
        <span>/</span>
        <span>Wallet Detective</span>
      </div>
      <div className="page-head">
        <div>
          <h1>Wallet Detective</h1>
          <p>{evmChains[chain].name} / observed Alpha-token activity only</p>
        </div>
        <a
          className="button"
          href={explorerUrl(chain, "address", address)!}
          target="_blank"
          rel="noreferrer"
        >
          View on explorer
        </a>
      </div>
      <div className="address-row">
        <code>{address}</code>
        <CopyAddress address={address} />
      </div>
      <div className="notice">
        Identity: unknown unless independently corroborated. This profile covers
        locally observed Alpha tokens and transfer windows. Missing balances are
        unavailable, not zero. A common counterparty does not prove common
        control.
      </div>
      <section className="workbench">
        <div className="section-top">
          <h2>Observed balance samples</h2>
          <span>Partial coverage / not a holder leaderboard</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Alpha token</th>
                <th>Raw atomic balance</th>
                <th>Block</th>
                <th>Source / time</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((b) => (
                <tr key={b.token_id}>
                  <td>
                    <TokenIdentity token={tokenVisual(b.token_identity)} />
                  </td>
                  <td>
                    <code>{b.raw_quantity}</code>
                  </td>
                  <td>{b.block_number}</td>
                  <td>
                    {b.source}
                    <small>{iso(b.observed_at)}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!balances.length ? (
            <div className="empty">
              <h3>No verified balance samples</h3>
              <p>
                Balances require successful eth_call observations at a specific
                confirmed block. Historical holding duration and cost basis
                remain unavailable.
              </p>
            </div>
          ) : null}
        </div>
      </section>
      <section className="workbench">
        <div className="section-top">
          <h2>Alpha transfer history</h2>
          <span>Latest 100 canonical observations</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Token / time</th>
                <th>Counterparty</th>
                <th>Token units</th>
                <th>Type</th>
                <th>Transaction</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((t) => {
                const other =
                  t.from_address === address ? t.to_address : t.from_address;
                return (
                  <tr key={`${t.tx_hash}:${t.log_index}`}>
                    <td>
                      <TokenIdentity token={tokenVisual(t.token_identity)} />
                      <small>{iso(t.event_time)}</small>
                    </td>
                    <td>
                      <Link href={`/wallet/${chain}/${other}`}>
                        {other.slice(0, 12)}…
                      </Link>
                    </td>
                    <td>
                      {t.from_address === address ? "Sent" : "Received"}{" "}
                      {num(tokenUnits(t.raw_quantity, t.decimals), 4)}
                    </td>
                    <td>{t.kind.replaceAll("_", " ")}</td>
                    <td>
                      <a
                        href={explorerUrl(chain, "tx", t.tx_hash)!}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t.tx_hash.slice(0, 16)}…
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!transfers.length ? (
            <div className="empty">
              <p>
                No matching on-chain evidence in the local collection. This does
                not establish that the address is inactive.
              </p>
            </div>
          ) : null}
        </div>
      </section>
      <div className="two-column">
        <section className="workbench">
          <div className="section-top">
            <h2>Labels and provenance</h2>
          </div>
          <div className="panel-content">
            {labels.length ? (
              labels.map((l) => (
                <div key={l.id}>
                  <h3>
                    {l.role} / {l.entity || "entity unspecified"}
                  </h3>
                  <p>
                    {l.confidence} / valid from {iso(l.valid_from)}
                  </p>
                  <p>{l.notes}</p>
                  <a href={l.source_url} target="_blank" rel="noreferrer">
                    Evidence source
                  </a>
                </div>
              ))
            ) : (
              <p>
                No labels supplied. No exchange or market-maker identity is
                inferred.
              </p>
            )}
            <details>
              <summary>Add a sourced manual label</summary>
              <MutationForm
                actionName="label"
                extra={{ chain, address }}
                label="Save label assertion"
              >
                <label>
                  Role
                  <select name="role">
                    {[
                      "unknown",
                      "possible_exchange",
                      "verified_exchange",
                      "possible_market_maker",
                      "verified_market_maker",
                      "possible_team/treasury",
                      "verified_team/treasury",
                      "vesting",
                      "DEX_pool",
                      "router",
                      "burn",
                      "bridge",
                    ].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Entity
                  <input name="entity" maxLength={100} defaultValue="" />
                </label>
                <label>
                  Evidence URL
                  <input
                    name="sourceUrl"
                    type="url"
                    required
                    maxLength={2000}
                  />
                </label>
                <label>
                  Scope, supporting evidence and uncertainty
                  <textarea
                    name="notes"
                    minLength={10}
                    maxLength={3000}
                    required
                  />
                </label>
                <p className="muted">
                  Even a manually selected “verified” role remains independently
                  unverified until reviewed. Future backtests must use labels
                  valid at the signal time.
                </p>
              </MutationForm>
            </details>
          </div>
        </section>
        <section className="workbench">
          <div className="section-top">
            <h2>Investigation notes</h2>
          </div>
          <div className="panel-content">
            <ResearchNote chain={chain} address={address} />
            {notes.map((n) => (
              <article key={n.id}>
                <small>{iso(n.created_at)} / manual hypothesis</small>
                <p>{n.body}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
