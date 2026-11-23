import type { DbRows } from "../../../lib/data";
import Link from "next/link";
import { sqlClient } from "@flownix/db";
import { requireAccess } from "../../../lib/auth";
import { WalletSearch } from "../../../components/wallet-search";
import { iso } from "../../../lib/data";
export const metadata = { title: "Wallet Intelligence" };
export default async function Clusters() {
  await requireAccess();
  let wallets: DbRows = [],
    relationships: DbRows = [],
    rotations: DbRows = [],
    graph: DbRows = [];
  try {
    const sql = sqlClient();
    [wallets, relationships, rotations, graph] = await Promise.all([
      sql`SELECT chain_id,address,first_seen FROM wallets ORDER BY first_seen DESC LIMIT 50`,
      sql`SELECT r.*,t.symbol FROM wallet_relationships r LEFT JOIN alpha_tokens t ON t.id=r.token_id ORDER BY r.observed_at DESC LIMIT 20`,
      sql`WITH firsts AS (SELECT DISTINCT ON(s.chain_id,s.actor,s.token_id) s.chain_id,s.actor,s.token_id,s.event_time,s.available_at,t.symbol FROM verified_swaps s JOIN alpha_tokens t ON t.id=s.token_id WHERE s.canonical AND s.actor IS NOT NULL AND s.side='buy' ORDER BY s.chain_id,s.actor,s.token_id,s.event_time,s.available_at)
        SELECT chain_id,actor,jsonb_agg(jsonb_build_object('tokenId',token_id,'symbol',symbol,'firstObservedPurchase',event_time,'availableAt',available_at) ORDER BY event_time) AS tokens FROM firsts GROUP BY chain_id,actor HAVING count(*)>1 ORDER BY max(available_at) DESC LIMIT 20`,
      sql`SELECT value FROM settings WHERE key='graph_research_sync'`,
    ]);
  } catch {
    wallets = [];
    relationships = [];
  }
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Wallet Intelligence</h1>
          <p>
            Follow actual addresses. Keep ownership and identity claims
            separate.
          </p>
        </div>
        <Link className="button" href="/rotation">
          Exchange Rotation
        </Link>
      </div>
      <section className="workbench">
        <div className="section-top">
          <h2>Wallet Detective</h2>
        </div>
        <WalletSearch />
        <div className="panel-content">
          <p className="muted">
            Search reads the local observed ledger. It does not launch an
            unbounded blockchain scan or query a paid label provider.
          </p>
        </div>
      </section>
      <section className="workbench">
        <div className="section-top">
          <h2>Cluster Intelligence</h2>
          <span>Evidence before common-control claims</span>
        </div>
        <div className="panel-content">
          <p>
            Shared token sources and similar verified-buy timing are observed
            connections. They do not establish native-gas funding, common
            ownership, independent holder counts or coordinated intent.
          </p>
          <p className="muted">
            Last local graph pass {iso(graph[0]?.value.at)} /{" "}
            {graph[0]?.value.truncated
              ? "bounded sample truncated"
              : "partial observed ledger"}
            . {graph[0]?.value.repeatedPairs?.length ?? 0} pairs observed across
            multiple Alpha tokens; identities remain unverified.
          </p>
        </div>
        {relationships.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Addresses</th>
                  <th>Rule</th>
                  <th>Confidence / evidence</th>
                </tr>
              </thead>
              <tbody>
                {relationships.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/wallet/${r.chain_id}/${r.address_a}`}>
                        {r.address_a}
                      </Link>
                      <small>
                        <Link href={`/wallet/${r.chain_id}/${r.address_b}`}>
                          {r.address_b}
                        </Link>
                      </small>
                    </td>
                    <td>
                      {r.rule.replaceAll("_", " ")}
                      <small>Chain {r.chain_id}</small>
                      {r.token_id ? (
                        <Link href={`/token/${r.token_id}`}>
                          {r.symbol ?? r.token_id}
                        </Link>
                      ) : null}
                    </td>
                    <td>
                      {r.confidence}
                      <details>
                        <summary>Evidence</summary>
                        <pre>{JSON.stringify(r.evidence, null, 2)}</pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h3>No supported wallet relationships yet</h3>
            <p>
              No supported connection in the inspected sample. Missing
              relationships do not establish wallet independence. All generated
              connections remain possibly related, with alternative explanations
              retained.
            </p>
          </div>
        )}
      </section>
      <section className="workbench">
        <div className="section-top">
          <h2>Previously observed wallets in another Alpha token</h2>
          <span>Verified-buy sample</span>
        </div>
        <div className="panel-content">
          <p>
            First locally observed purchases across exact Alpha identities.
            Earlier holdings, wallet birth and beneficial ownership remain
            unknown.
          </p>
          {rotations.length ? (
            <ol>
              {rotations.map((r) => (
                <li key={`${r.chain_id}:${r.actor}`}>
                  <Link href={`/wallet/${r.chain_id}/${r.actor}`}>
                    {r.actor}
                  </Link>
                  <ol>
                    {r.tokens.map(
                      (t: {
                        tokenId: string;
                        symbol: string;
                        firstObservedPurchase: string;
                        availableAt: string;
                      }) => (
                        <li key={t.tokenId}>
                          <Link href={`/token/${t.tokenId}`}>{t.symbol}</Link> /
                          purchase {iso(t.firstObservedPurchase)} / available{" "}
                          {iso(t.availableAt)}
                        </li>
                      ),
                    )}
                  </ol>
                </li>
              ))}
            </ol>
          ) : (
            <p>
              No cross-token verified-purchase sequence in the available ledger.
            </p>
          )}
        </div>
      </section>
      <section className="workbench">
        <div className="section-top">
          <h2>Addresses discovered in Alpha transfers</h2>
          <span>Latest 50 / partial address coverage</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Chain</th>
                <th>Address</th>
                <th>Identity</th>
              </tr>
            </thead>
            <tbody>
              {wallets.map((w) => (
                <tr key={`${w.chain_id}:${w.address}`}>
                  <td>{w.chain_id}</td>
                  <td>
                    <Link href={`/wallet/${w.chain_id}/${w.address}`}>
                      {w.address}
                    </Link>
                  </td>
                  <td>Unknown</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!wallets.length ? (
            <div className="empty">
              <p>
                Addresses appear after successful confirmed Transfer ingestion.
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
