import { Suspense } from "react";
import { health, safeRadar } from "../../../lib/data";
import { requireAccess } from "../../../lib/auth";
import { Radar } from "../../../components/radar";
export const metadata = { title: "Accumulation Watchlist" };
export default async function Watchlist() {
  await requireAccess();
  const [h, tokens] = await Promise.all([health(), safeRadar()]);
  return (
    <Suspense fallback={<p>Loading watchlist…</p>}>
      <Radar tokens={tokens} health={h} watchlist />
    </Suspense>
  );
}
