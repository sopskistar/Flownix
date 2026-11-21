import { Suspense } from "react";
import { health, safeRadar } from "../../../lib/data";
import { requireAccess } from "../../../lib/auth";
import { Radar } from "../../../components/radar";
export const metadata = { title: "Accumulation Watchlist" };
export const dynamic = "force-dynamic";

async function WatchlistContent() {
  const [h, tokens] = await Promise.all([health(), safeRadar()]);
  return <Radar tokens={tokens} health={h} asOf={Date.now()} watchlist />;
}

export default async function Watchlist() {
  await requireAccess();
  return (
    <Suspense fallback={<p role="status">Loading watchlist…</p>}>
      <WatchlistContent />
    </Suspense>
  );
}
