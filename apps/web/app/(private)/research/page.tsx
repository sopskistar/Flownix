import Link from "next/link";
import { requireAccess } from "../../../lib/auth";
import { safeRadar } from "../../../lib/data";
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
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Historical Runner Lab</h1>
          <p>
            Reconstruct what could have been known. Keep failures and
            inconclusive cases.
          </p>
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
                    <td>Only from first provable observation</td>
                    <td>Not reconstructed; source gaps unresolved</td>
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
          <span>Adapter unavailable</span>
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
            Flownix does not currently decode verified swaps. Farming or
            wash-volume classification remains unavailable; turnover alone is
            not called accumulation or manipulation. Public posts by
            @Eveningtraders and @JuliusElum can be added as journal leads with
            original URLs; no posts were scraped or treated as facts.
          </p>
        </div>
      </section>
    </>
  );
}
