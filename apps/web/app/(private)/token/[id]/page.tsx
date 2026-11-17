import Link from "next/link";
import { notFound } from "next/navigation";
import { sqlClient } from "@flownix/db";
import {
  explorerUrl,
  evmChains,
  tokenUnits,
  researchWindows,
} from "@flownix/core";
import { requireAccess } from "../../../../lib/auth";
import { iso, num, range } from "../../../../lib/data";
import {
  CopyAddress,
  ActionButton,
  ResearchNote,
} from "../../../../components/controls";
import { PriceChart } from "../../../../components/chart";
import { MutationForm } from "../../../../components/forms";
export const metadata = { title: "Token Intelligence" };
export default async function Token({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAccess();
  const { id } = await params;
  if (!/^[a-f0-9]{32}$/.test(id)) notFound();
  const sql = sqlClient();
  const rows =
    await sql`SELECT t.*,w.token_id IS NOT NULL AND NOT w.archived AS watched FROM alpha_tokens t LEFT JOIN watchlists w ON w.token_id=t.id WHERE t.id=${id}`;
  if (!rows.length) notFound();
  const t = rows[0],
    q = await searchParams,
    r = range(q);
  const [
    symbols,
    markets,
    transfers,
    signals,
    notes,
    states,
    cursors,
    persistence,
    classificationRows,
  ] = await Promise.all([
    sql`SELECT * FROM market_symbols WHERE alpha_id=${t.alpha_id} AND active ORDER BY quote_asset`,
    sql`SELECT * FROM market_snapshots WHERE token_id=${id} AND source_kind IN ('alpha_market','alpha_registry') AND price IS NOT NULL ORDER BY CASE source_kind WHEN 'alpha_market' THEN 0 ELSE 1 END,observed_at DESC LIMIT 1`,
    sql`SELECT * FROM token_transfers WHERE token_id=${id} AND canonical AND event_time>=${r.start} AND event_time<=${r.end} ORDER BY event_time DESC LIMIT 100`,
    sql`SELECT * FROM signal_events WHERE token_id=${id} ORDER BY first_detected_at DESC LIMIT 30`,
    sql`SELECT * FROM manual_research_notes WHERE token_id=${id} ORDER BY created_at DESC LIMIT 100`,
    sql`SELECT * FROM research_state_history WHERE token_id=${id} ORDER BY observed_at DESC LIMIT 100`,
    sql`SELECT c.*,s.value AS trace FROM block_cursors c LEFT JOIN settings s ON s.key='trace:'||c.token_id WHERE token_id=${id}`,
    sql`SELECT DISTINCT ON(window_days) * FROM accumulation_observations WHERE token_id=${id} ORDER BY window_days,computed_at DESC`,
    sql`SELECT * FROM token_project_classifications WHERE token_id=${id}`,
  ]);
  const m = markets[0],
    symbol =
      m?.symbol ??
      symbols.find((s) => s.quote_asset === "USDT")?.symbol ??
      symbols[0]?.symbol;
  const candles = symbol
    ? await sql`SELECT open_at,close,volume FROM ohlcv_candles WHERE symbol=${symbol} AND close_at>=${r.start} AND close_at<=${r.end} ORDER BY open_at DESC LIMIT 5000`
    : [];
  const link = explorerUrl(t.chain_id, "token", t.contract);
  const chain = evmChains[t.chain_id];
  return (
    <>
      <div className="breadcrumbs">
        <Link href="/">Alpha Radar</Link>
        <span>/</span>
        <span>{t.symbol}</span>
      </div>
      <div className="page-head">
        <div>
          <h1>
            {t.name} <span className="muted">{t.symbol}</span>
          </h1>
          <p>
            {t.metadata.chainName} / {t.alpha_id ?? "No Alpha ID"} / {t.status}{" "}
            membership
          </p>
        </div>
        <ActionButton
          className="primary"
          payload={{ action: "watch", tokenId: id, enabled: !t.watched }}
        >
          {t.watched ? "Remove from watchlist" : "Monitor this token"}
        </ActionButton>
      </div>
      <div className="address-row">
        <code>{t.contract}</code>
        <CopyAddress address={t.contract} />
        {link ? (
          <a href={link} target="_blank" rel="noreferrer">
            Contract evidence
          </a>
        ) : (
          <span>Explorer not configured</span>
        )}
      </div>
      <div className="status-strip">
        <span>
          First observed <strong>{iso(t.first_seen)}</strong>
        </span>
        <span>
          Provider listing time <strong>{iso(t.listing_time)}</strong>
        </span>
        <span>
          Research state <strong>{t.research_state.toLowerCase()}</strong>
        </span>
      </div>
      <div className="notice subtle">
        Provider listing time is a metadata claim. Membership is only proven by
        collected registry snapshots from {iso(t.first_seen)}. Earlier candles
        are context, not proof that an Alpha signal could have existed then.
      </div>
      <section className="workbench">
        <div className="section-top">
          <h2>Project research eligibility</h2>
          <span>{classificationRows[0]?.classification ?? "unclassified"}</span>
        </div>
        <div className="panel-content">
          <p>Use a project-controlled or otherwise reliable source to support this manual classification. Flownix stores the source and rationale; it does not fetch arbitrary URLs or independently certify the claim. Only owner-reviewed non-meme projects enter the default research scanner.</p>
          <MutationForm actionName="classification" extra={{ tokenId: id }} label="Save classification review">
            <div className="form-grid">
              <label>Classification<select name="classification" defaultValue={classificationRows[0]?.classification ?? "unclassified"}><option value="verified_non_meme">Non-meme project — owner reviewed</option><option value="verified_meme_focused">Meme-focused project</option><option value="mixed_ambiguous">Mixed / ambiguous</option><option value="unclassified">Unclassified — needs review</option></select></label>
              <label>Evidence URL<input name="evidenceUrl" type="url" defaultValue={classificationRows[0]?.evidence_url ?? ""} required maxLength={2000} /></label>
              <label className="search-filter">Evidence and rationale<textarea name="evidenceNote" defaultValue={classificationRows[0]?.evidence_note ?? ""} minLength={10} maxLength={3000} required /></label>
            </div>
          </MutationForm>
          {classificationRows[0] ? <p className="muted">Reviewed {iso(classificationRows[0].reviewed_at)} / {classificationRows[0].reviewed_by}. This is an owner-sourced classification, not an automated identity finding.</p> : null}
        </div>
      </section>
      <section className="workbench">
        <div className="section-top">
          <h2>Market history</h2>
          <span>{symbol ?? "No verified tradable pair"}</span>
        </div>
        <form className="range-bar">
          <label>
            Window
            <select name="days" defaultValue={String(q.days ?? 30)}>
              {researchWindows.map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
              <option value="all">Full observed history</option>
            </select>
          </label>
          <label>
            From
            <input
              name="from"
              type="date"
              defaultValue={typeof q.from === "string" ? q.from : ""}
            />
          </label>
          <label>
            To
            <input
              name="to"
              type="date"
              defaultValue={typeof q.to === "string" ? q.to : ""}
            />
          </label>
          <button>Apply range</button>
        </form>
        <PriceChart
          points={candles
            .toReversed()
            .map((c) => ({
              at: new Date(c.open_at).toISOString(),
              price: String(c.close),
              volume: String(c.volume),
            }))}
          quote={
            m?.quote_asset ?? symbols[0]?.quote_asset ?? "quote unavailable"
          }
          symbol={symbol ?? "unavailable"}
        />
      </section>
      <div className="two-column">
        <section className="workbench">
          <div className="section-top">
            <h2>Long-term accumulation</h2>
            <span>Purchase-ledger coverage</span>
          </div>
          <div className="panel-content">
            <p className="warning">Insufficient evidence</p>
            <p>
              Verified buying, retained purchase quantities, independent
              accumulators, supply concentration and cost basis are unavailable.
              Transfers alone cannot populate these metrics.
            </p>
            <div className="window-grid">
              {researchWindows.map((d) => (
                <div key={d}>
                  <strong>{d} days</strong>
                  <span>
                    {persistence
                      .find((p) => p.window_days === d)
                      ?.metrics.state?.toLowerCase() ?? "Not evaluated"}
                  </span>
                </div>
              ))}
            </div>
            <p className="muted">
              No numerical opportunity score is assigned. Flat price does not
              reset your thesis or remove this token from the watchlist.
            </p>
          </div>
        </section>
        <section className="workbench">
          <div className="section-top">
            <h2>Coverage and contradictions</h2>
          </div>
          <dl className="facts">
            <div>
              <dt>{m?.source_kind === "alpha_market" ? "Official Alpha ticker price" : m?.source_kind === "alpha_registry" ? "Official Alpha registry price (quote unspecified)" : "Official Alpha price"}</dt>
              <dd>
                {m ? `${num(m.price, 8)}${m.quote_asset ? ` ${m.quote_asset}` : ""}` : "Unavailable"}
              </dd>
            </div>
            <div>
              <dt>Market observed</dt>
              <dd>{iso(m?.observed_at)}</dd>
            </div>
            <div>
              <dt>Registry liquidity</dt>
              <dd>{num(t.metadata.liquidity)}</dd>
            </div>
            <div>
              <dt>Transfer adapter</dt>
              <dd>
                {chain
                  ? cursors.length
                    ? "Observed EVM logs"
                    : "Configured; no verified scans yet"
                  : "Not available on this chain"}
              </dd>
            </div>
            <div>
              <dt>Last scanned block</dt>
              <dd>{cursors[0]?.block_number ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Detection trace</dt>
              <dd>
                {cursors[0]?.trace?.reason ??
                  "No completed detection evaluation"}
              </dd>
            </div>
            <div>
              <dt>DEX buys / sells</dt>
              <dd>Unavailable (no verified decoder)</dd>
            </div>
            <div>
              <dt>Exchange attribution</dt>
              <dd>Partial manual labels only</dd>
            </div>
            <div>
              <dt>Spot / Futures listing</dt>
              <dd>Not independently verified</dd>
            </div>
          </dl>
        </section>
      </div>
      <section className="workbench">
        <div className="section-top">
          <h2>Accumulation research timeline</h2>
          <span>Observations and hypotheses stay distinct</span>
        </div>
        <ol className="timeline">
          <li>
            <time>{iso(t.first_seen)}</time>
            <div>
              <span className="tag">Verified source observation</span>
              <h3>First local Alpha registry inclusion</h3>
              <p>
                Response hash <code>{t.response_hash.slice(0, 16)}…</code>. Full
                source response is retained in PostgreSQL.
              </p>
            </div>
          </li>
          {[
            ...states.map((s) => ({
              at: s.observed_at,
              label: s.rule_version.startsWith("manual")
                ? "Manual hypothesis"
                : "Rule evaluation",
              title: s.to_state.toLowerCase(),
              body: s.reason,
            })),
            ...signals.map((s) => ({
              at: s.first_detected_at,
              label: "Transfer observation",
              title: s.kind,
              body: s.message,
            })),
            ...notes.map((n) => ({
              at: n.created_at,
              label: "Research note / hypothesis",
              title: "Journal entry",
              body: n.body,
            })),
          ]
            .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
            .map((e, i) => (
              <li key={i}>
                <time>{iso(e.at)}</time>
                <div>
                  <span className="tag">{e.label}</span>
                  <h3>{e.title}</h3>
                  <p>{e.body}</p>
                </div>
              </li>
            ))}
        </ol>
      </section>
      <section className="workbench">
        <div className="section-top">
          <h2>Verified transfer ledger</h2>
          <span>Latest 100 canonical events in range</span>
        </div>
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Transfer evidence"
        >
          <table>
            <thead>
              <tr>
                <th>Time (UTC)</th>
                <th>From / to</th>
                <th className="numeric">Token units</th>
                <th>Classification</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((e) => (
                <tr key={`${e.tx_hash}:${e.log_index}`}>
                  <td>{iso(e.event_time)}</td>
                  <td>
                    <Link href={`/wallet/${t.chain_id}/${e.from_address}`}>
                      {e.from_address.slice(0, 10)}…
                    </Link>
                    <small>
                      <Link href={`/wallet/${t.chain_id}/${e.to_address}`}>
                        to {e.to_address.slice(0, 10)}…
                      </Link>
                    </small>
                  </td>
                  <td className="numeric">
                    <span title={tokenUnits(e.raw_quantity, e.decimals)}>
                      {num(tokenUnits(e.raw_quantity, e.decimals), 4)}
                    </span>
                  </td>
                  <td>{e.kind.replaceAll("_", " ")}</td>
                  <td>
                    <a
                      href={explorerUrl(t.chain_id, "tx", e.tx_hash) ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {e.tx_hash.slice(0, 12)}… / log {e.log_index}
                    </a>
                    <small>Block {e.block_number}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!transfers.length ? (
            <div className="empty">
              <h3>
                {chain
                  ? "No confirmed transfer evidence in this range"
                  : "Not available on this chain"}
              </h3>
              <p>
                {chain
                  ? "The collector needs a working RPC with eth_getLogs. Empty coverage is not evidence of inactivity."
                  : "Market metadata is supported; a chain-specific event adapter is not implemented."}
              </p>
            </div>
          ) : null}
        </div>
      </section>
      <div className="two-column">
        <section className="workbench">
          <div className="section-top">
            <h2>Research journal</h2>
          </div>
          <div className="panel-content">
            <ResearchNote tokenId={id} />
          </div>
        </section>
        <section className="workbench">
          <div className="section-top">
            <h2>Thesis state</h2>
            <span>Manual annotation</span>
          </div>
          <div className="panel-content">
            <MutationForm
              actionName="thesis_state"
              extra={{ tokenId: id }}
              label="Record thesis revision"
            >
              <label>
                State
                <select name="state" defaultValue={t.research_state}>
                  {[
                    "DISCOVERY",
                    "EARLY ACCUMULATION",
                    "SUSTAINED ACCUMULATION",
                    "SUPPLY CONCENTRATION",
                    "STRENGTHENING SETUP",
                    "PRICE EXPANSION",
                    "DISTRIBUTION RISK",
                    "THESIS INVALIDATED",
                    "INSUFFICIENT EVIDENCE",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Evidence and contradictions
                <textarea
                  name="reason"
                  required
                  minLength={10}
                  maxLength={2000}
                />
              </label>
              <p className="muted">
                Manual states are hypotheses and remain labelled as such in the
                audit timeline.
              </p>
            </MutationForm>
          </div>
        </section>
      </div>
    </>
  );
}
