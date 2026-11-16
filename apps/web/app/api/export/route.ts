import { NextResponse } from "next/server";
import { accessAllowed } from "../../../lib/auth";
import { sqlClient } from "@flownix/db";
import { safeCsv } from "@flownix/core";
export async function GET(request: Request) {
  if (!(await accessAllowed()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const kind = new URL(request.url).searchParams.get("kind") ?? "signals";
  try {
    const sql = sqlClient();
    let rows;
    if (kind === "tokens")
      rows =
        await sql`SELECT id,chain_id,contract,symbol,alpha_id,status,research_state,first_seen,last_seen,source FROM alpha_tokens ORDER BY id`;
    else if (kind === "signals")
      rows =
        await sql`SELECT * FROM signal_events ORDER BY first_detected_at LIMIT 10000`;
    else if (kind === "paper")
      rows =
        await sql`SELECT * FROM paper_trades ORDER BY created_at LIMIT 10000`;
    else if (kind === "outcomes")
      rows =
        await sql`SELECT * FROM signal_outcomes ORDER BY computed_at LIMIT 10000`;
    else if (kind === "journal")
      rows =
        await sql`SELECT * FROM manual_research_notes ORDER BY created_at LIMIT 10000`;
    else
      return NextResponse.json(
        { error: "Unsupported export" },
        { status: 400 },
      );
    const keys = rows.length ? Object.keys(rows[0]) : ["no_observations"];
    const csv = [
      keys.map(safeCsv).join(","),
      ...rows.map((r) =>
        keys
          .map((k) => safeCsv(r[k] instanceof Date ? r[k].toISOString() : r[k]))
          .join(","),
      ),
    ].join("\r\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="flownix-${kind}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Evidence store unavailable" },
      { status: 503 },
    );
  }
}
