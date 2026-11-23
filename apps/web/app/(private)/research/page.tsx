import Link from "next/link";
import { requireAccess } from "../../../lib/auth";
import { safeRadar } from "../../../lib/data";
import { sqlClient } from "@flownix/db";
import { TokenIdentity } from "../../../components/token-identity";
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
];
export default async function Research() {
  await requireAccess();
  const tokens = await safeRadar();
  const runs =
    await sqlClient()`SELECT DISTINCT ON(manifest->'event'->>'tokenId') run_hash,computed_at,manifest,report FROM event_study_runs WHERE spec_version='listing-study/1' AND jsonb_typeof(manifest)='object' AND manifest->'event'->>'tokenId' IS NOT NULL AND jsonb_typeof(report)='object' AND report ? 'phases' ORDER BY manifest->'event'->>'tokenId',computed_at DESC`;
  const cohort = (
    await sqlClient()`SELECT report->'cohort' AS cohort FROM event_study_runs WHERE spec_version='fixed-cohort/2' AND jsonb_typeof(report)='object' ORDER BY computed_at DESC LIMIT 1`
  )[0]?.cohort;
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
            manipulation. Public posts by
            @Eveningtraders and @JuliusElum can be added as journal leads with
            original URLs; no posts were scraped or treated as facts.
          </p>
        </div>
      </section>
    </>
  );
}
