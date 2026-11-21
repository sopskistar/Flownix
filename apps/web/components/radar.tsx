"use client";
import { useMemo, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { freshness } from "@flownix/core/browser";
import type { RadarToken, Health } from "../lib/data";
import { ActionButton } from "./controls";
import { TokenIdentity } from "./token-identity";
const n = (v: string | null, d = 2) =>
  v !== null && v !== "" && Number.isFinite(Number(v))
    ? new Intl.NumberFormat("en-US", {
        maximumFractionDigits: d,
        notation: Math.abs(Number(v)) >= 1e6 ? "compact" : "standard",
      }).format(Number(v))
    : "—";
const stamp = (s: string | null) =>
  s
    ? new Date(s).toLocaleString("en-GB", {
        timeZone: "UTC",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }) + " UTC"
    : "Unavailable";
const days = (at: string) =>
  Math.max(0, Math.floor((Date.now() - Date.parse(at)) / 86400000));
export function Radar({
  tokens,
  health,
  watchlist = false,
}: {
  tokens: RadarToken[];
  health: Health;
  watchlist?: boolean;
}) {
  const query = useSearchParams(),
    router = useRouter(),
    path = usePathname();
  const [pending, setPending] = useState(false);
  const set = (key: string, v: string) => {
    const params = new URLSearchParams(query.toString());
    if (v) params.set(key, v);
    else params.delete(key);
    if (key !== "page") params.delete("page");
    setPending(true);
    router.replace(`${path}?${params.toString()}`, { scroll: false });
    setTimeout(() => setPending(false), 150);
  };
  const search = (query.get("q") ?? "").toLowerCase(),
    chain = query.get("chain") ?? "",
    sort = query.get("sort") ?? (watchlist ? "oldest" : "liquidity"),
    state = query.get("state") ?? "",
    membership = query.get("membership") ?? "current",
    classification = query.get("classification") ?? "";
  const cap = Number(query.get("minCap") ?? 0),
    liquidity = Number(query.get("minLiquidity") ?? 0),
    page = Math.max(1, Number(query.get("page")) || 1),
    size = 30;
  const filtered = useMemo(
    () =>
      tokens
        .filter(
          (t) =>
            (!watchlist || t.watchlisted) &&
            (!membership || t.status === membership) &&
            (!classification || t.classification === classification) &&
            (!chain || t.chain_id === chain) &&
            (!state || t.research_state === state) &&
            (!cap || Number(t.market_cap) >= cap) &&
            (!liquidity || Number(t.liquidity) >= liquidity) &&
            `${t.symbol} ${t.name} ${t.contract} ${t.alpha_id}`
              .toLowerCase()
              .includes(search),
        )
        .sort((a, b) =>
          sort === "oldest"
            ? a.first_seen.localeCompare(b.first_seen)
            : sort === "activity"
              ? b.signal_count - a.signal_count
              : sort === "name"
                ? a.symbol.localeCompare(b.symbol)
                : Number(b[sort === "cap" ? "market_cap" : "liquidity"] ?? -1) -
                    Number(
                      a[sort === "cap" ? "market_cap" : "liquidity"] ?? -1,
                    ) || a.id.localeCompare(b.id),
        ),
    [
      tokens,
      watchlist,
      membership,
      classification,
      chain,
      state,
      cap,
      liquidity,
      search,
      sort,
    ],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / size)),
    safePage = Math.min(page, pages),
    shown = filtered.slice((safePage - 1) * size, safePage * size);
  const isFresh =
    health.registry && freshness(health.registry.at) === "current";
  const workerLive =
    health.heartbeat &&
    !health.heartbeat.stopped &&
    freshness(health.heartbeat.at, Date.now(), 90) === "current";
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{watchlist ? "Accumulation Watchlist" : "Alpha Radar"}</h1>
          <p>
            {watchlist
              ? "Patient research. Persistent theses. Evidence across weeks and months."
              : "The verified Alpha universe, observed over time."}
          </p>
        </div>
        <div className="head-actions">
          <Link className="button quiet" href="/api/export?kind=tokens">
            Export CSV
          </Link>
          <ActionButton className="primary" payload={{ action: "sync" }}>
            Queue registry sync
          </ActionButton>
        </div>
      </div>
      <div className="status-strip">
        <span>
          <strong>{health.registry?.count ?? "—"}</strong> registry identities
        </span>
        <span>
          <strong>{tokens.filter((t) => t.deep_selected).length}</strong>{" "}
          selected for deeper research
        </span>
        <span>
          <strong>{tokens.filter((t) => t.last_scan).length}</strong> with
          observed scan coverage
        </span>
        <span className={isFresh ? "positive" : "warning"}>
          {isFresh
            ? "Registry current"
            : health.registry
              ? "Registry stale"
              : "Registry unavailable"}
        </span>
        <span className={workerLive ? "positive" : "warning"}>
          {workerLive ? "Collector running" : "Collector offline / unverified"}
        </span>
      </div>
      {!health.database || !health.registry ? (
        <div className="notice">
          <strong>
            {!health.database
              ? "Connect the evidence store"
              : "Waiting for the first official registry sync"}
          </strong>
          <p>
            {health.error ??
              "No verified Alpha tokens are stored yet. Start pnpm worker:dev and inspect Data Health. A failed provider never substitutes a sample universe."}
          </p>
          <Link href="/settings">Inspect data health</Link>
        </div>
      ) : !isFresh ? (
        <div className="notice">
          Showing the last successful registry observation from{" "}
          {stamp(health.registry.at)}. Status is historical until the collector
          succeeds again.
        </div>
      ) : null}
      <section className="workbench" aria-label="Alpha universe">
        <div className="section-top">
          <h2>{watchlist ? "Your monitored theses" : "Universe ledger"}</h2>
          <span>{filtered.length} matching identities</span>
        </div>
        <div className="filters">
          <label className="search-filter">
            Search
            <input
              type="search"
              value={query.get("q") ?? ""}
              onChange={(e) => set("q", e.target.value)}
              placeholder="Symbol, name, contract or Alpha ID"
            />
          </label>
          <label>
            Chain
            <select
              value={chain}
              onChange={(e) => set("chain", e.target.value)}
            >
              <option value="">All networks</option>
              {[
                ...new Map(
                  tokens.map((t) => [t.chain_id, t.chain_name]),
                ).entries(),
              ]
                .sort()
                .map(([id, name]) => (
                  <option key={id} value={id}>
                    {name} —{" "}
                    {
                      tokens.filter(
                        (t) => t.chain_id === id && t.status === "current",
                      ).length
                    }{" "}
                    active Alpha identities · chain ID {id}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Membership
            <select
              value={membership}
              onChange={(e) => set("membership", e.target.value)}
            >
              <option value="current">Current</option>
              <option value="">All observed</option>
              <option value="offline">Offline</option>
              <option value="removed">Removed</option>
              <option value="unknown">Unknown status</option>
            </select>
          </label>
          <label>
            Project classification
            <select
              value={classification}
              onChange={(e) => set("classification", e.target.value)}
            >
              <option value="">All official Alpha identities (default)</option>
              <option value="verified_non_meme">Owner-reviewed non-meme</option>
              <option value="unclassified">Unclassified</option>
              <option value="mixed_ambiguous">Mixed / ambiguous</option>
              <option value="verified_meme_focused">Meme-focused</option>
            </select>
          </label>
          <label>
            Min. cap (registry)
            <select
              value={query.get("minCap") ?? ""}
              onChange={(e) => set("minCap", e.target.value)}
            >
              <option value="">Any</option>
              <option value="1000000">1 million</option>
              <option value="10000000">10 million</option>
              <option value="100000000">100 million</option>
            </select>
          </label>
          <label>
            Min. liquidity
            <select
              value={query.get("minLiquidity") ?? ""}
              onChange={(e) => set("minLiquidity", e.target.value)}
            >
              <option value="">Any</option>
              <option value="100000">100,000</option>
              <option value="1000000">1 million</option>
            </select>
          </label>
          <label>
            Sort by
            <select value={sort} onChange={(e) => set("sort", e.target.value)}>
              <option value="liquidity">Liquidity</option>
              <option value="oldest">Longest observation</option>
              <option value="activity">Unresolved activity</option>
              <option value="cap">Market cap</option>
              <option value="name">Token name</option>
            </select>
          </label>
        </div>
        <details className="advanced-filters">
          <summary>Research stage filter</summary>
          <label>
            Lifecycle
            <select
              value={state}
              onChange={(e) => set("state", e.target.value)}
            >
              <option value="">All stages</option>
              {[...new Set(tokens.map((t) => t.research_state))]
                .sort()
                .map((s) => (
                  <option key={s}>{s}</option>
                ))}
            </select>
          </label>
        </details>
        <div
          className={`table-scroll${shown.length ? " radar-desktop" : ""}`}
          tabIndex={0}
          role="region"
          aria-label="Scrollable Alpha token table"
          aria-busy={pending}
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Watch</th>
                <th scope="col">Token / network</th>
                <th scope="col">Alpha identity</th>
                <th scope="col" className="numeric">
                  Alpha price
                </th>
                <th scope="col" className="numeric">
                  24h change
                </th>
                <th scope="col" className="numeric secondary">
                  Market cap
                </th>
                <th scope="col" className="numeric secondary">
                  Liquidity
                </th>
                <th scope="col" className="numeric secondary">
                  24h quote volume
                </th>
                <th scope="col">Research / evidence</th>
                <th scope="col" className="secondary">
                  Observation
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => (
                <tr key={t.id}>
                  <td>
                    <ActionButton
                      payload={{
                        action: "watch",
                        tokenId: t.id,
                        enabled: !t.watchlisted,
                      }}
                    >
                      <span
                        aria-label={
                          t.watchlisted
                            ? `Unwatch ${t.symbol}`
                            : `Watch ${t.symbol}`
                        }
                      >
                        {t.watchlisted ? "Saved" : "Save"}
                      </span>
                    </ActionButton>
                  </td>
                  <td>
                    <TokenIdentity token={t.visual} />
                  </td>
                  <td>
                    <code>{t.alpha_id ?? "—"}</code>
                    <small className="muted">{t.status}</small>
                  </td>
                  <td className="numeric">
                    {n(t.price, 8)}
                    <small>
                      {t.price_source === "alpha_market"
                        ? `Alpha ticker · ${t.quote_asset}`
                        : t.price_source === "alpha_registry"
                          ? "Alpha registry · quote unspecified"
                          : "No price observation"}
                    </small>
                  </td>
                  <td
                    className={`numeric ${t.change_24h === null ? "muted" : Number(t.change_24h) >= 0 ? "positive" : "negative"}`}
                  >
                    {t.change_24h === null ? "—" : `${n(t.change_24h)}%`}
                  </td>
                  <td className="numeric secondary">{n(t.market_cap)}</td>
                  <td className="numeric secondary">{n(t.liquidity)}</td>
                  <td className="numeric secondary">
                    {n(t.volume_24h)}
                    <small>{t.quote_asset ?? "—"}</small>
                  </td>
                  <td>
                    <span className="tag">
                      {t.research_state.replaceAll("_", " ").toLowerCase()}
                    </span>
                    <small className="muted">
                      {t.signal_count
                        ? `${t.signal_count} activity alerts`
                        : "Insufficient accumulation evidence"}
                    </small>
                  </td>
                  <td className="secondary">
                    <span>{days(t.first_seen)} days observed</span>
                    <small
                      className={
                        freshness(t.price_at) === "current"
                          ? "positive"
                          : "warning"
                      }
                    >
                      {freshness(t.price_at)}{" "}
                      {t.price_source === "alpha_market"
                        ? "Alpha ticker"
                        : t.price_source === "alpha_registry"
                          ? "registry metadata"
                          : "market data"}
                    </small>
                    <small className="muted">{stamp(t.price_at)}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!shown.length ? (
            <div className="empty">
              <svg viewBox="0 0 48 48" aria-hidden="true">
                <path d="M8 12h32M8 24h20M8 36h12" />
                <circle cx="35" cy="32" r="8" />
              </svg>
              <h3>
                {tokens.length
                  ? "No identities match these filters"
                  : "Evidence begins with a verified source"}
              </h3>
              <p>
                {watchlist
                  ? "Save a verified Alpha token from the Radar to follow its thesis over time."
                  : tokens.length
                    ? "Adjust the search or membership filter."
                    : "No live universe has been verified by this collector. Provider errors and setup steps are available in Data Health."}
              </p>
              <Link className="button" href={watchlist ? "/" : "/settings"}>
                {watchlist ? "Explore Alpha Radar" : "Open Data Health"}
              </Link>
            </div>
          ) : null}
        </div>
        <div
          className="radar-mobile-list"
          aria-label="Alpha token observations"
          aria-busy={pending}
        >
          {shown.map((t) => (
            <article key={t.id} className="radar-mobile-token">
              <div className="radar-mobile-identity">
                <TokenIdentity token={t.visual} />
              </div>
              <div className="radar-mobile-price">
                <span>{n(t.price, 8)}</span>
                <small>{t.quote_asset ?? "Quote unspecified"}</small>
                <span
                  className={
                    t.change_24h === null
                      ? "muted"
                      : Number(t.change_24h) >= 0
                        ? "positive"
                        : "negative"
                  }
                >
                  {t.change_24h === null ? "—" : `${n(t.change_24h)}%`}{" "}
                  <small>24h</small>
                </span>
              </div>
              <div className="radar-mobile-freshness">
                <span
                  className={
                    freshness(t.price_at) === "current" ? "positive" : "warning"
                  }
                >
                  {freshness(t.price_at)}{" "}
                  {t.price_source === "alpha_market"
                    ? "Alpha ticker"
                    : t.price_source === "alpha_registry"
                      ? "registry metadata"
                      : "market data"}
                </span>
                <small>{stamp(t.price_at)}</small>
              </div>
              <ActionButton
                payload={{
                  action: "watch",
                  tokenId: t.id,
                  enabled: !t.watchlisted,
                }}
              >
                {t.watchlisted ? "Saved" : "Save"}
              </ActionButton>
              <details className="radar-mobile-evidence">
                <summary>Identity, statistics & evidence</summary>
                <dl>
                  <dt>Alpha identity</dt>
                  <dd>
                    {t.alpha_id ?? "Unavailable"} / {t.status}
                  </dd>
                  <dt>Market cap (registry)</dt>
                  <dd>{n(t.market_cap)}</dd>
                  <dt>Liquidity (registry)</dt>
                  <dd>{n(t.liquidity)}</dd>
                  <dt>24h quote volume</dt>
                  <dd>
                    {n(t.volume_24h)} {t.quote_asset ?? "Quote unspecified"}
                  </dd>
                  <dt>Research</dt>
                  <dd>{t.research_state.replaceAll("_", " ").toLowerCase()}</dd>
                  <dt>Evidence</dt>
                  <dd>
                    {t.signal_count
                      ? `${t.signal_count} activity alerts`
                      : "Insufficient accumulation evidence"}
                  </dd>
                  <dt>Observation</dt>
                  <dd>{days(t.first_seen)} days observed</dd>
                </dl>
              </details>
            </article>
          ))}
        </div>
        <div className="pagination">
          <span>
            Page {safePage} of {pages} / {filtered.length} identities
          </span>
          <div>
            <button
              disabled={safePage <= 1}
              onClick={() => set("page", String(safePage - 1))}
            >
              Previous
            </button>
            <button
              disabled={safePage >= pages}
              onClick={() => set("page", String(safePage + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </section>
      <div className="research-footnote">
        <p>
          Only chain + contract identities from observed official Alpha registry
          responses enter this ledger. Alpha market prices retain their quote
          asset. Cap and liquidity are registry metadata; their valuation
          methodology is not independently verified.
        </p>
        <p>
          Verified net buying, retention, supply concentration and opportunity
          scores remain unavailable without adequate purchase and ownership
          coverage. Activity alerts are investigation leads.
        </p>
      </div>
    </>
  );
}
