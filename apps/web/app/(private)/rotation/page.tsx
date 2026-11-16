import type { DbRows } from "../../../lib/data";
import Link from "next/link";
import { sqlClient } from "@flownix/db";
import { requireAccess } from "../../../lib/auth";
import { iso } from "../../../lib/data";
export const metadata = { title: "Exchange Rotation" };
export default async function Rotation() {
  await requireAccess();
  let rows: DbRows = [];
  try {
    rows =
      await sqlClient()`SELECT l.chain_id,l.address,l.entity,l.role,l.confidence,l.source_url,count(DISTINCT e.token_id)::int AS tokens,count(DISTINCT(e.tx_hash,e.log_index))::int AS events,max(e.event_time) AS last_event FROM wallet_labels l LEFT JOIN token_transfers e ON e.chain_id=l.chain_id AND (e.from_address=l.address OR e.to_address=l.address) AND e.canonical AND e.event_time>=l.valid_from AND (l.valid_to IS NULL OR e.event_time<l.valid_to) WHERE l.role IN ('verified_exchange','possible_exchange') GROUP BY l.id ORDER BY tokens DESC LIMIT 100`;
  } catch {
    rows = [];
  }
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Exchange Rotation</h1>
          <p>
            Observed Alpha-token interactions with sourced exchange-label
            assertions.
          </p>
        </div>
        <Link className="button" href="/clusters">
          Open Wallet Detective
        </Link>
      </div>
      <div className="notice">
        Coverage is partial. Manual labels are independently unverified. Public
        transfers cannot reconstruct internal exchange activity, beneficial
        ownership or trading intent. Multiple Alpha-token interactions do not
        prove market making.
      </div>
      <section className="workbench">
        <div className="section-top">
          <h2>Cross-token overlap</h2>
          <span>Label-valid events only</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Entity assertion</th>
                <th>Address / chain</th>
                <th>Alpha identities</th>
                <th>Observed events</th>
                <th>Last event</th>
                <th>Provenance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.chain_id}:${r.address}:${r.source_url}`}>
                  <td>
                    {r.entity || "Unknown"}
                    <small>
                      {r.role} / {r.confidence}
                    </small>
                  </td>
                  <td>
                    <Link href={`/wallet/${r.chain_id}/${r.address}`}>
                      {r.address.slice(0, 14)}… / {r.chain_id}
                    </Link>
                  </td>
                  <td>{r.tokens}</td>
                  <td>{r.events}</td>
                  <td>{iso(r.last_event)}</td>
                  <td>
                    <a href={r.source_url} target="_blank" rel="noreferrer">
                      Label evidence
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length ? (
            <div className="empty">
              <h3>No exchange-label evidence stored</h3>
              <p>
                Add an evidence URL and scoped label from a Wallet Detective
                profile. No unqualified Binance or Bitget net-flow figure is
                calculated.
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
