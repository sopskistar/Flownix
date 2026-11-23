import Link from "next/link";
import { sqlClient } from "@flownix/db";
import {
  supplyConcentration,
  concentrationChange,
  derivativesContext,
  freshness,
  catalystKinds,
  socialResearchLeads,
  type HolderSnapshot,
  type ChainLabel,
} from "@flownix/core";
import { iso, num } from "../lib/data";
import { MutationForm } from "./forms";

export async function TokenResearchContext({
  token,
}: {
  token: {
    id: string;
    chain_id: string;
    contract: string;
    metadata?: Record<string, unknown>;
    last_seen?: string | Date;
  };
}) {
  const sql = sqlClient(),
    asOf = new Date().toISOString();
  const [
    holders,
    labels,
    relationships,
    derivatives,
    liquidity,
    leads,
    volume,
    pools,
    recent,
  ] = await Promise.all([
    sql`SELECT * FROM holder_metrics WHERE token_id=${token.id} AND canonical ORDER BY observed_at DESC LIMIT 2`,
    sql`SELECT * FROM wallet_labels WHERE chain_id=${token.chain_id}`,
    sql`SELECT * FROM wallet_relationships WHERE token_id=${token.id} ORDER BY observed_at DESC LIMIT 20`,
    sql`SELECT * FROM derivatives_observations WHERE token_id=${token.id} ORDER BY observed_at DESC LIMIT 2`,
    sql`SELECT * FROM pool_liquidity_observations WHERE token_id=${token.id} AND canonical ORDER BY available_at DESC LIMIT 2`,
    sql`SELECT * FROM research_leads WHERE token_id=${token.id} ORDER BY first_observed_at DESC LIMIT 30`,
    sql`SELECT value FROM settings WHERE key=${"volume_quality:" + token.id}`,
    sql`SELECT p.*,(SELECT max(end_time) FROM scan_windows w WHERE w.token_id=p.token_id AND w.to_block=p.verified_at_block) AS verified_block_time FROM token_dex_pools p WHERE p.token_id=${token.id}`,
    sql`SELECT * FROM live_scan_checkpoints WHERE token_id=${token.id}`,
  ]);
  const snapshot = holders[0]?.evidence as HolderSnapshot | undefined;
  const attribution: ChainLabel[] = labels.map((l) => ({
    chain: l.chain_id,
    address: l.address,
    entity: l.entity ?? "",
    role: l.role,
    verified:
      !!l.reviewed_by &&
      !/unverified|manual assertion|third.party/i.test(l.confidence),
    source: l.source_url,
    validFrom: new Date(l.valid_from).toISOString(),
    validTo: l.valid_to ? new Date(l.valid_to).toISOString() : null,
    availableAt: new Date(l.created_at).toISOString(),
  }));
  for (const p of pools)
    attribution.push({
      chain: p.chain_id,
      address: p.address,
      entity: `pool:${p.address}`,
      role: "DEX_pool",
      verified: true,
      source: p.evidence.source,
      validFrom: new Date(p.verified_block_time ?? p.observed_at).toISOString(),
      validTo: null,
      availableAt: new Date(p.observed_at).toISOString(),
    });
  const concentration = snapshot
    ? supplyConcentration(snapshot, attribution, asOf)
    : null;
  const change = snapshot
    ? concentrationChange(
        holders[1]?.evidence ?? null,
        snapshot,
        attribution,
        asOf,
      )
    : null;
  const latest = derivatives[0];
  const derivative = latest
    ? derivativesContext(
        derivatives.map((r) => ({
          symbol: r.symbol,
          openInterest: r.evidence.openInterest.openInterest,
          markPrice: r.evidence.funding.markPrice,
          at: new Date(r.provider_time).toISOString(),
          availableAt: new Date(r.observed_at).toISOString(),
        })),
        latest.symbol,
        asOf,
      )
    : null;
  const validDerivative = derivative && derivative.status !== "unavailable";
  const registrySupplyClaim = (key: string) => {
    const value = token.metadata?.[key];
    return typeof value === "string" && /^\d+(\.\d+)?$/.test(value)
      ? value
      : "Unavailable";
  };
  return (
    <>
      <section className="workbench" aria-labelledby="supply-research-heading">
        <div className="section-top">
          <h2 id="supply-research-heading">
            Supply concentration & connected wallets
          </h2>
          <span>{concentration?.status ?? "unavailable"}</span>
        </div>
        <div className="panel-content">
          <p>
            Address balances and observed connections describe evidence, not
            beneficial ownership. Pools, custody and independent customers must
            not be merged into one owner.
          </p>
          {recent[0] ? (
            <p className="muted">
              Recent source sample: block {String(recent[0].block_number)},
              source time {iso(recent[0].source_time)}, collected{" "}
              {iso(recent[0].observed_at)}. Historical cursor is preserved
              separately. Intervening blocks are not assumed observed; this is
              not continuous holder or transfer coverage.
            </p>
          ) : null}
          <dl className="research-facts">
            <div>
              <dt>Top 10 / 20 / 50 holders</dt>
              <dd>
                {concentration?.top
                  ? `${concentration.top["10"]}% / ${concentration.top["20"]}% / ${concentration.top["50"]}% of total supply`
                  : "Unavailable — a complete reconciled holder census is required"}
              </dd>
            </div>
            <div>
              <dt>Observed total supply</dt>
              <dd>
                {concentration?.totalRaw ?? "Unavailable"}
                {concentration?.totalRaw ? " raw atomic units" : ""}
              </dd>
            </div>
            <div>
              <dt>Verified circulating supply</dt>
              <dd>
                {concentration?.circulatingRaw ??
                  "Unavailable — not inferred from market cap or custody exclusions"}
              </dd>
            </div>
            <div>
              <dt>Verified operational exclusions in sample</dt>
              <dd>
                {concentration?.excludedRaw ?? "Unavailable"}
                {concentration?.excludedRaw !== null &&
                concentration?.excludedRaw !== undefined
                  ? " raw units; not a complete excluded-supply census"
                  : ""}
              </dd>
            </div>
            <div>
              <dt>Unknown / unclassified sample supply</dt>
              <dd>
                {concentration?.unknownRaw ?? "Unavailable"}
                {concentration?.unknownRaw
                  ? " raw units; independence unverified"
                  : ""}
              </dd>
            </div>
            <div>
              <dt>Concentration change</dt>
              <dd>
                {change
                  ? `${change["10"]} percentage points for top 10`
                  : "Unavailable — comparable complete snapshots required"}
              </dd>
            </div>
            <div>
              <dt>Possible connected concentration</dt>
              <dd>
                Unavailable without reconciled holder coverage; observed edges
                are research leads.
              </dd>
            </div>
          </dl>
          <p className="muted">
            {concentration?.reason ??
              "No checkpoint supply observation yet. Existing balance samples do not establish a holder leaderboard."}
          </p>
          <details>
            <summary>Official registry supply claims</summary>
            <p>
              Total {registrySupplyClaim("totalSupply")} / circulating{" "}
              {registrySupplyClaim("circulatingSupply")} in provider token
              units, observed {iso(token.last_seen)}. Provider claims may
              aggregate networks; they are not a verified chain holder census or
              a custody-adjusted circulating-supply calculation.
            </p>
          </details>
          {snapshot ? (
            <p className="muted">
              Checkpoint {snapshot.checkpoint} / source time {iso(snapshot.at)}{" "}
              / first available {iso(snapshot.availableAt)}.{" "}
              {freshness(snapshot.availableAt) !== "current"
                ? "Historical observation; current supply may differ."
                : ""}
            </p>
          ) : null}
          {concentration?.contradictions.map((text) => (
            <p className="notice" key={text}>
              {text}
            </p>
          ))}
          <details>
            <summary>
              Observed relationship evidence ({relationships.length} shown)
            </summary>
            {relationships.length ? (
              <ol>
                {relationships.map((r) => (
                  <li key={r.id}>
                    <Link href={`/wallet/${r.chain_id}/${r.address_a}`}>
                      {r.address_a.slice(0, 12)}…
                    </Link>{" "}
                    /{" "}
                    <Link href={`/wallet/${r.chain_id}/${r.address_b}`}>
                      {r.address_b.slice(0, 12)}…
                    </Link>
                    <p>
                      {r.rule.replaceAll("_", " ")} / {r.confidence}. Common
                      ownership unverified.
                    </p>
                    <pre>{JSON.stringify(r.evidence, null, 2)}</pre>
                  </li>
                ))}
              </ol>
            ) : (
              <p>
                No generated connection in the bounded local ledger. Missing
                relationships do not establish independence.
              </p>
            )}
          </details>
        </div>
      </section>
      <section className="workbench" aria-labelledby="derivatives-heading">
        <div className="section-top">
          <h2 id="derivatives-heading">Futures positioning context</h2>
          <span>{derivative?.status ?? "unavailable"}</span>
        </div>
        <div className="panel-content">
          <p>
            Exact Alpha contract and independently sourced Futures association
            required. Equal tickers are insufficient; derivatives positioning is
            separate from spot buying.
          </p>
          {latest ? (
            <>
              <p>
                {latest.symbol} / {latest.evidence.instrument.contractType} /{" "}
                {latest.evidence.instrument.baseAsset} / multiplier{" "}
                {latest.evidence.association.multiplier}
              </p>
              <dl className="research-facts">
                <div>
                  <dt>Open interest</dt>
                  <dd>
                    {validDerivative
                      ? latest.evidence.openInterest.openInterest
                      : "Unavailable — stale observation"}
                  </dd>
                </div>
                <div>
                  <dt>OI change / mark-price change</dt>
                  <dd>
                    {derivative?.oiChangePct !== null
                      ? `${derivative?.oiChangePct}% / ${derivative?.priceChangePct}%`
                      : "Unavailable — comparable current observations required"}
                  </dd>
                </div>
                <div>
                  <dt>Last funding rate (fraction)</dt>
                  <dd>
                    {freshness(
                      new Date(latest.evidence.funding.time),
                      Date.now(),
                      3600,
                    ) === "current"
                      ? latest.evidence.funding.lastFundingRate
                      : "Unavailable — stale"}
                  </dd>
                </div>
                <div>
                  <dt>Long / short account ratio</dt>
                  <dd>
                    {latest.evidence.longShortRatio[0] &&
                    freshness(
                      new Date(latest.evidence.longShortRatio[0].timestamp),
                      Date.now(),
                      3600,
                    ) === "current"
                      ? latest.evidence.longShortRatio[0].longShortRatio
                      : "Unavailable or stale"}
                  </dd>
                </div>
                <div>
                  <dt>24h derivatives quote volume</dt>
                  <dd>
                    {freshness(
                      new Date(latest.evidence.ticker.closeTime),
                      Date.now(),
                      3600,
                    ) === "current"
                      ? num(latest.evidence.ticker.quoteVolume)
                      : "Unavailable — stale"}
                  </dd>
                </div>
              </dl>
              <p>{derivative?.interpretation}</p>
              <p className="muted">
                Provider time {iso(latest.provider_time)} / locally available{" "}
                {iso(latest.observed_at)}. No liquidation causality inferred.
              </p>
              <a
                href={latest.evidence.association.projectLinkSource}
                target="_blank"
                rel="noreferrer"
              >
                Instrument association source
              </a>
            </>
          ) : (
            <p>
              No verified instrument observation. Public Futures access, exact
              project linkage and recent historical limits must be checked
              before collection; no trading keys are used.
            </p>
          )}
        </div>
      </section>
      <section
        className="workbench"
        aria-labelledby="liquidity-quality-heading"
      >
        <div className="section-top">
          <h2 id="liquidity-quality-heading">Liquidity & retained buying</h2>
          <span>Coverage before interpretation</span>
        </div>
        <div className="panel-content">
          <p>
            {liquidity.length
              ? `Verified pool-balance samples: ${liquidity.length} shown. Latest ${iso(liquidity[0].block_time)} at block ${liquidity[0].block_number}.`
              : "Historical pool balances unavailable. Registry liquidity is a separate provider claim."}
          </p>
          <p>
            V3 pool balances do not establish executable depth. Liquidity
            removal, exchange-associated deposits and distribution require
            time-valid pool/label evidence; missing history is not a flat
            series.
          </p>
          {liquidity.length ? (
            <details>
              <summary>Pool provenance and observed balances</summary>
              <pre>
                {JSON.stringify(
                  liquidity.map((r) => ({
                    pool: r.pool_address,
                    block: r.block_number,
                    at: r.block_time,
                    availableAt: r.available_at,
                    evidence: r.evidence,
                  })),
                  null,
                  2,
                )}
              </pre>
            </details>
          ) : null}
          {volume[0] ? (
            <details>
              <summary>Gross volume versus observed net settlement</summary>
              <p>
                Rolling sample, not retained ownership or farming intent.
                Existing longitudinal retention evidence remains below.
              </p>
              <pre>{JSON.stringify(volume[0].value, null, 2)}</pre>
            </details>
          ) : (
            <p>
              No attributed swap-quality materialization. Gross volume alone
              cannot establish accumulation.
            </p>
          )}
        </div>
      </section>
      <section className="workbench" aria-labelledby="source-leads-heading">
        <div className="section-top">
          <h2 id="source-leads-heading">
            Social, listing & allocation research
          </h2>
          <span>Source-linked manual leads</span>
        </div>
        <div className="panel-content">
          <p>
            Automatic social collection is unavailable. Leads are not a mention
            census, independent-author count or evidence of profitable calls.
            Publication and event times remain claims until verified.
          </p>
          <details>
            <summary>Add a source-linked research lead</summary>
            <MutationForm
              actionName="research_lead"
              extra={{ tokenId: token.id }}
              label="Save research lead"
            >
              <div className="form-grid">
                <label>
                  Event type
                  <select name="kind">
                    {catalystKinds.map((k) => (
                      <option key={k} value={k}>
                        {k.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Original source URL
                  <input
                    type="url"
                    name="sourceUrl"
                    required
                    maxLength={2000}
                  />
                </label>
                <label>
                  Author / publisher
                  <input
                    name="author"
                    maxLength={100}
                    list="research-accounts"
                  />
                  <datalist id="research-accounts">
                    {socialResearchLeads.map((a) => (
                      <option key={a} value={`@${a}`} />
                    ))}
                  </datalist>
                </label>
                <label>
                  Claimed publication (ISO UTC, optional)
                  <input
                    name="claimedPublishedAt"
                    placeholder="2026-11-22T12:30:00Z"
                    maxLength={40}
                  />
                </label>
                <label>
                  Claimed event time (ISO UTC, optional)
                  <input
                    name="claimedEventAt"
                    placeholder="2026-11-25T00:00:00Z"
                    maxLength={40}
                  />
                </label>
                <label>
                  Revision of lead ID (optional)
                  <input name="revisionOf" maxLength={36} />
                </label>
              </div>
              <label>
                Research summary and contradictory evidence
                <textarea
                  name="body"
                  required
                  minLength={10}
                  maxLength={3000}
                />
              </label>
              <p className="muted">
                Store your summary and original link. No arbitrary URL is
                fetched, no paid feed is activated, and first-local-observation
                time is recorded by the database.
              </p>
            </MutationForm>
          </details>
          {leads.length ? (
            <ol>
              {leads.map((l) => (
                <li key={l.id}>
                  <a href={l.source_url} target="_blank" rel="noreferrer">
                    {l.kind.replaceAll("_", " ")} /{" "}
                    {l.author || "publisher unverified"}
                  </a>
                  <p>{l.body}</p>
                  <p className="muted">
                    Publication claim {iso(l.claimed_published_at)} / first
                    observed {iso(l.first_observed_at)} / event claim{" "}
                    {iso(l.claimed_event_at)} / {l.status}
                  </p>
                  <small>
                    ID {l.id}
                    {l.revision_of ? ` / revises ${l.revision_of}` : ""}
                  </small>
                </li>
              ))}
            </ol>
          ) : (
            <p>
              No source-linked leads recorded for this exact Alpha identity.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
