import type { DbRows } from "../../../lib/data";
import Link from "next/link";
import { sqlClient } from "@flownix/db";
import { requireAccess } from "../../../lib/auth";
import { iso } from "../../../lib/data";
import { ResearchNote } from "../../../components/controls";
import { tokenVisual } from "@flownix/core";
import { TokenIdentity } from "../../../components/token-identity";
export const metadata = { title: "Research Journal" };
export default async function Journal() {
  await requireAccess();
  let notes: DbRows = [];
  try {
    notes =
      await sqlClient()`SELECT n.*,t.symbol,to_jsonb(t) AS token_identity FROM manual_research_notes n LEFT JOIN alpha_tokens t ON t.id=n.token_id ORDER BY n.created_at DESC LIMIT 200`;
  } catch {
    notes = [];
  }
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Research Journal</h1>
          <p>
            Keep hypotheses, counter-evidence and the original observation time.
          </p>
        </div>
        <Link className="button" href="/api/export?kind=journal">
          Export journal
        </Link>
      </div>
      <section className="workbench">
        <div className="section-top">
          <h2>Workspace note</h2>
          <span>Manual hypothesis</span>
        </div>
        <div className="panel-content">
          <ResearchNote />
        </div>
      </section>
      <section className="workbench">
        <div className="section-top">
          <h2>Saved observations and hypotheses</h2>
        </div>
        {notes.length ? (
          <div className="journal-list">
            {notes.map((n) => (
              <article key={n.id}>
                <div className="row">
                  <time>{iso(n.created_at)}</time>
                  <span className="tag">Manual note</span>
                  {n.token_id ? (
                    <TokenIdentity token={tokenVisual(n.token_identity)} />
                  ) : null}
                </div>
                <p>{n.body}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty">
            <p>
              No journal entries yet. Token pages keep a combined timeline of
              automatic source observations, rule evaluations and your notes.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
