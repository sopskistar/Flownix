import type { DbRows } from "../../../lib/data";
import Link from "next/link";
import { sqlClient } from "@flownix/db";
import { requireAccess } from "../../../lib/auth";
import { WalletSearch } from "../../../components/wallet-search";
export const metadata = { title: "Wallet Intelligence" };
export default async function Clusters() {
  await requireAccess();
  let wallets: DbRows = [],
    relationships: DbRows = [];
  try {
    wallets =
      await sqlClient()`SELECT chain_id,address,first_seen FROM wallets ORDER BY first_seen DESC LIMIT 50`;
    relationships =
      await sqlClient()`SELECT * FROM wallet_relationships ORDER BY observed_at DESC LIMIT 20`;
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
                    <td>{r.rule}</td>
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
              No clustering inference has been generated. Shared funding or
              synchronized transfers would require explainable evidence and
              remain “possibly related,” not proven common ownership. Graph
              visualization is deferred until relationships are supported.
            </p>
          </div>
        )}
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
