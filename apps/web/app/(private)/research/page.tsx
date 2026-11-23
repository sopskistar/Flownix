import Link from "next/link";
import { requireAccess } from "../../../lib/auth";
import { safeRadar } from "../../../lib/data";
import { sqlClient } from "@flownix/db";
import { TokenIdentity } from "../../../components/token-identity";
import type { historicalEpisodes, fixedWindowCohort } from "@flownix/core";
type EpisodeReport = {
  cases: (ReturnType<typeof historicalEpisodes> & { symbol: string })[];
  independence: {
    ruleEpisodes: number;
    distinctConfirmations: number;
    projects: number;
  };
  universeCoverage: { officialIdentities: number; withHourlySeries: number };
  controls: {
    target: string;
    selected: { tokenId: string }[];
    outcomes: ReturnType<typeof fixedWindowCohort>;
    suppressed: string | null;
  }[];
  fixedWindowRanking: {
    anchor: string;
    end: string;
    results: ReturnType<typeof fixedWindowCohort>;
  };
  validation: { eligibleHistoricalSignals: number; suppression: string };
};
export const metadata = { title: "Historical Runner Lab" };
const candidates = [
  "LAB",
  "AKE",
  "RAVE",
  "JCT",
  "AGT",
  "PIEVERSE",
  "BTW",
  "AIN",
  "IDOL",
  "EVAA",
  "CAP",
  "Q",
  "BLESS",
  "IRYS",
  "TAG",
  "JELLYJELLY",
  "DOYR",
  "TUT",
  "MYX",
  "SIREN",
  "XCX",
  "U",
  "POWER",
  "PIPPIN",
  "OVL",
  "FHE",
  "BULLA",
  "MAGMA",
  "SENTIS",
  "NAORIS",
  "PAAL",
  "AIOT",
  "ARIA",
  "NES",
];
export default async function Research() {
  await requireAccess();
  const tokens = await safeRadar();
  const runs =
    await sqlClient()`SELECT DISTINCT ON(manifest->'event'->>'tokenId') run_hash,computed_at,manifest,report FROM event_study_runs WHERE spec_version='listing-study/1' AND jsonb_typeof(manifest)='object' AND manifest->'event'->>'tokenId' IS NOT NULL AND jsonb_typeof(report)='object' AND report ? 'phases' ORDER BY manifest->'event'->>'tokenId',computed_at DESC`;
  const cohort = (
    await sqlClient()`SELECT report->'cohort' AS cohort FROM event_study_runs WHERE spec_version='fixed-cohort/2' AND jsonb_typeof(report)='object' ORDER BY computed_at DESC LIMIT 1`
  )[0]?.cohort;
  const episodeRun = (
    await sqlClient()`SELECT run_hash,computed_at,jsonb_build_object('cases',(SELECT COALESCE(jsonb_agg(c - 'featureAudits'),'[]'::jsonb) FROM jsonb_array_elements(report->'cases') c),'independence',report->'independence','universeCoverage',report->'universeCoverage','controls',report->'controls','fixedWindowRanking',report->'fixedWindowRanking','validation',report->'validation') AS report FROM event_study_runs WHERE spec_version='historical-episodes/1' AND jsonb_typeof(report)='object' AND jsonb_typeof(report->'cases')='array' AND report ? 'independence' ORDER BY computed_at DESC LIMIT 1`
  )[0];
  const history = episodeRun?.report as EpisodeReport | undefined;
  const sources =
    await sqlClient()`SELECT l.*,t.symbol FROM research_leads l JOIN alpha_tokens t ON t.id=l.token_id WHERE l.kind='forensic_claim' OR l.source_url IN('https://www.binance.com/en/support/announcement/detail/0927ee2f460a4041a5e6a871a4ad9d4b','https://www.binance.com/en-AE/support/announcement/detail/21fab8e9db5f4dd8a1446e1a3eb6ceb1','https://bless.network/mica/whitepaper.pdf') ORDER BY l.first_observed_at DESC LIMIT 12`;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Historical Runner Lab</h1>
          <p>
            Reconstruct what could have been known. Keep failures and
            inconclusive cases.
          </p>
          {cohort && (
            <p>
              Fixed historical window {cohort.definition.setupAt} to{" "}
              {cohort.definition.endAt}:{" "}
              {cohort.results.length - cohort.unavailable} complete hourly
              paths; {cohort.observed2xPeaks ?? "Unavailable"} reached 2× highs,{" "}
              {cohort.non2xPeakControls ?? "Unavailable"} non-2× peak controls,{" "}
              {cohort.confirmed2x} closed at 2×. Raw Alpha prices; no verified
              strategy or executable profit.
            </p>
          )}
        </div>
        <Link className="button" href="/paper">
          Performance Lab
        </Link>
      </div>
      <div className="notice">
        Candidate tickers below are user-supplied leads, not an admitted
        research universe. Only identities matched to collected official
        registry responses link to token research. Current membership never
        proves historical Alpha membership.
      </div>
      <section
        className="workbench"
        aria-labelledby="historical-episodes-title"
      >
        <div className="section-top">
          <h2 id="historical-episodes-title">
            Historical rally episodes and controls
          </h2>
          <Link
            href={
              episodeRun
                ? `/api/export?kind=research&run=${episodeRun.run_hash}`
                : "/api/export?kind=research"
            }
          >
            Download complete evidence
          </Link>
        </div>
        <div className="panel-content">
          <p>
            Rolling 7/30-day lows and a predefined consolidation breakout use
            closed candles to confirm a condition. Forward returns begin at that
            confirmation close. Observed extrema are context; they are not
            achievable entry and exit prices.
          </p>
          {history ? (
            <>
              <p>
                {history.universeCoverage.withHourlySeries} of{" "}
                {history.universeCoverage.officialIdentities} identities have
                stored hourly series. {history.independence.ruleEpisodes} rule
                episodes, {history.independence.distinctConfirmations} distinct
                confirmation times across {history.independence.projects} Alpha
                ID groups. Overlapping definitions are not independent examples.
                Missing series remain incomplete.
              </p>
              <p>
                {history.validation.suppression} Admissible historical signals:{" "}
                {history.validation.eligibleHistoricalSignals}. No validated
                strategy.
              </p>
              {history.cases.map((c) => (
                <details key={c.identity.tokenId}>
                  <summary>
                    {c.symbol} / {c.identity.market} / {c.episodes.length}{" "}
                    retrospective episodes
                  </summary>
                  <p>
                    <Link href={`/token/${c.identity.tokenId}`}>
                      Open exact token research
                    </Link>{" "}
                    · Chain {c.identity.chain} ·{" "}
                    <code>{c.identity.contract}</code>
                  </p>
                  <p>
                    Observed window {c.landmarks.first ?? "Unavailable"} to{" "}
                    {c.landmarks.last ?? "Unavailable"}: low{" "}
                    {c.landmarks.low?.price ?? "Unavailable"} at{" "}
                    {c.landmarks.low?.at ?? "Unavailable"}; high{" "}
                    {c.landmarks.high?.price ?? "Unavailable"} at{" "}
                    {c.landmarks.high?.at ?? "Unavailable"}. {c.landmarks.gaps}{" "}
                    hourly gaps. Lifetime ATL/ATH and executable liquidity are
                    unverified.
                  </p>
                  <div
                    className="table-scroll"
                    role="region"
                    aria-label={`${c.symbol} historical episode table`}
                    tabIndex={0}
                  >
                    <table>
                      <thead>
                        <tr>
                          <th>Definition / confirmation</th>
                          <th>Reference close</th>
                          <th>Next 7-day peak / coverage</th>
                          <th>7-day close return</th>
                          <th>Historical eligibility / availability</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.episodes.length ? (
                          c.episodes.map((e) => (
                            <tr key={e.episodeHash}>
                              <td>
                                {e.definition === "rolling_7d_low"
                                  ? "7-day low confirmation"
                                  : e.definition === "rolling_30d_low"
                                    ? "30-day low confirmation"
                                    : "Consolidation breakout"}
                                <br />
                                <small>{e.confirmedAt}</small>
                              </td>
                              <td>
                                {e.referencePrice} {e.quote}
                              </td>
                              <td>
                                {e.peak?.multipleFromConfirmation ??
                                  "Unavailable"}
                                ×<br />
                                <small>
                                  {e.coverage === "complete_fixed_7d"
                                    ? "Complete 7-day path"
                                    : "Incomplete or gapped path"}
                                </small>
                              </td>
                              <td>
                                {e.outcomes.find((o) => o.days === 7)
                                  ?.returnPct ?? "Unavailable"}
                                {e.outcomes.find((o) => o.days === 7)
                                  ?.returnPct != null
                                  ? "%"
                                  : ""}
                              </td>
                              <td>
                                {e.historicalAlphaEligibility ===
                                "unproven_before_membership_bound"
                                  ? "Historical Alpha eligibility unproven"
                                  : "Documented by membership bound"}
                                <br />
                                <small>
                                  {e.retrospectiveOnly
                                    ? "Collected after confirmation"
                                    : "Available by confirmation"}
                                </small>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5}>
                              No confirmed episode in the covered window.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </details>
              ))}
              <details>
                <summary>
                  Preselected controls and fixed-window outcomes
                </summary>
                <p>
                  Control selection uses only membership, liquidity, observation
                  age, chain, quote and coverage known at the common anchor. The
                  window is {history.fixedWindowRanking.anchor} to{" "}
                  {history.fixedWindowRanking.end}. These are controls for this
                  window; earlier rallies need earlier matching evidence.
                  Winners, declines and missing outcomes remain in the sample.
                </p>
                {history.controls.map((g) => (
                  <p key={g.target}>
                    <Link href={`/token/${g.target}`}>Target research</Link>:{" "}
                    {g.suppressed ??
                      `${g.selected.length} controls selected before outcomes`}
                    .{" "}
                    {g.outcomes
                      .map(
                        (o) =>
                          `${o.tokenId}: ${o.returnPct === null ? "Censored / unavailable" : `${o.returnPct}% raw close return`}`,
                      )
                      .join("; ")}
                  </p>
                ))}
                <p>
                  Fixed-window ranking uses the same prior close and end time
                  for every series, not the lowest low and highest high. Full
                  source hashes, drawdowns, 1/3/7/14/30/60/90-day outcomes and
                  90/60/30/14/7/3/1-day feature-availability audits are in the
                  evidence export.
                </p>
              </details>
            </>
          ) : (
            <p>
              No standardized episode run yet. Missing history stays
              unavailable.
            </p>
          )}
          {sources.length > 0 && (
            <details>
              <summary>Historical source and correction register</summary>
              {sources.map((s) => (
                <div key={s.id}>
                  <p>
                    <a
                      href={s.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {s.symbol} · {s.author}
                    </a>{" "}
                    · {s.status}
                    {s.revision_of ? " · correction / revision" : ""}
                  </p>
                  <p>{s.body}</p>
                  <p>
                    Original publication:{" "}
                    {s.published_at
                      ? new Date(s.published_at).toISOString()
                      : "Not independently verified in stored evidence"}
                    ; first local observation:{" "}
                    {new Date(s.first_observed_at).toISOString()}. A reviewed
                    publication does not verify its allegations.
                  </p>
                </div>
              ))}
            </details>
          )}
        </div>
      </section>
      <section className="workbench">
        <div className="section-top">
          <h2>Futures listing event studies</h2>
          <Link href="/api/export?kind=research">
            Download research evidence
          </Link>
        </div>
        <div className="panel-content">
          <p>
            Announcement, scheduled start and first trade-bar evidence are
            separate. Retrospective prices are not historical Flownix signals,
            executable fills or proof that a listing caused a move.
          </p>
          {runs.length ? (
            runs.map((r) => (
              <details key={r.run_hash}>
                <summary>
                  {r.manifest.event.symbol} /{" "}
                  {
                    r.report.phases.horizons.filter(
                      (h: { status: string }) => h.status === "observed",
                    ).length
                  }{" "}
                  observed horizons / historically evaluated
                </summary>
                <p>
                  Announcement {r.manifest.event.announcementAt}; scheduled
                  start {r.manifest.event.scheduledStartAt}; first trade
                  evidence{" "}
                  {r.report.phases.actualStart?.earliest ?? "Unavailable"}.
                  Source first collected/reviewed later; original announcement
                  body{" "}
                  {r.report.originalAnnouncementContentVerified
                    ? "preserved"
                    : "not archived"}
                  .
                </p>
                {r.manifest.event.sourceUrl && (
                  <p>
                    <a
                      href={r.manifest.event.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Official listing source
                    </a>
                  </p>
                )}
                <pre>{JSON.stringify(r.report.phases, null, 2)}</pre>
                <p>{r.report.suppression}</p>
              </details>
            ))
          ) : (
            <p>
              No verified event-study runs yet. Missing history is retained as
              unavailable.
            </p>
          )}
        </div>
      </section>
      <section className="workbench">
        <div className="section-top">
          <h2>Candidate verification ledger</h2>
          <span>No assumed runners or fabricated case studies</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Supplied ticker</th>
                <th>Official identity observations</th>
                <th>Historical inclusion</th>
                <th>Pre-rally reconstruction</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((s) => {
                const found = tokens.filter(
                  (t) => t.symbol.toUpperCase() === s,
                );
                return (
                  <tr key={s}>
                    <td>{s}</td>
                    <td>
                      {found.length
                        ? found.map((t) => (
                            <div key={t.id}>
                              <TokenIdentity token={t.visual} />
                              <small>
                                {t.status} in latest collected snapshot
                              </small>
                            </div>
                          ))
                        : "Unverified — not a research candidate yet"}
                    </td>
                    <td>
                      {found.some((t) =>
                        runs.some((r) => r.manifest.event.tokenId === t.id),
                      )
                        ? "Dated official event; exact identity reviewed, original-content gaps retained"
                        : "Only from first provable observation"}
                    </td>
                    <td>
                      {found.some((t) =>
                        runs.some((r) => r.manifest.event.tokenId === t.id),
                      )
                        ? "Event-study results above; historical features and execution costs remain incomplete"
                        : "Not reconstructed; source gaps unresolved"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="workbench">
        <div className="section-top">
          <h2>JCT / BTW / exchange hypothesis</h2>
          <span>Unverified claims</span>
        </div>
        <div className="panel-content">
          <p>
            Supplied address{" "}
            <code>0xa4856E07D14045014B2c3FEce5460bD37B310F10</code>. The alleged
            338.84M JCT transfer and 163.96M BTW holding are not independently
            verified. No tx hash or historical block was supplied.
          </p>
          <p>
            Public search found third-party references to this address on
            multiple chains, including a Bitway holder page. These are leads;
            they establish neither common control nor market-making intent. No
            label or balance is imported as a verified fact.
          </p>
          <div className="row">
            <Link
              className="button"
              href="/wallet/56/0xa4856e07d14045014b2c3fece5460bd37b310f10"
            >
              Inspect local BSC evidence
            </Link>
            <a
              className="button"
              href="https://bscscan.com/address/0xa4856e07d14045014b2c3fece5460bd37b310f10"
              target="_blank"
              rel="noreferrer"
            >
              BSC explorer
            </a>
          </div>
          <p>
            Reproduction protocol and unresolved inputs:
            docs/CASE_STUDY_JCT_BTW.md in the repository. No manipulation claim
            is established.
          </p>
        </div>
      </section>
      <section className="workbench">
        <div className="section-top">
          <h2>Incentive-driven volume research</h2>
          <span>Intent classification unavailable</span>
        </div>
        <div className="panel-content">
          <p>
            <a
              href="https://bitquery.io/investigations/binance-alpha-points-farming"
              target="_blank"
              rel="noreferrer"
            >
              Bitquery’s quq investigation
            </a>{" "}
            describes rapid round trips and daily buying near Alpha Points
            thresholds during August to September 2026. Treat this as a
            documented research reference, not proof about other tokens.
          </p>
          <p>
            Flownix decodes supported-pool swaps when receipts, pool identity
            and token direction are verified. Farming or wash-like intent
            remains unverified; turnover alone is not called accumulation or
            manipulation. Public posts by @Eveningtraders and @JuliusElum can be
            added as journal leads with original URLs; no posts were scraped or
            treated as facts.
          </p>
        </div>
      </section>
    </>
  );
}
