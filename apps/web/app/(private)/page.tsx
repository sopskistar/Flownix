import { Suspense } from "react";
import { health, safeRadar } from "../../lib/data";
import { requireAccess } from "../../lib/auth";
import { Radar } from "../../components/radar";
export const dynamic = "force-dynamic";

async function RadarContent() {
  const [h, tokens] = await Promise.all([health(), safeRadar()]);
  return <Radar tokens={tokens} health={h} asOf={Date.now()} />;
}

export default async function Home() {
  await requireAccess();
  return (
    <Suspense fallback={<p role="status">Loading universe…</p>}>
      <RadarContent />
    </Suspense>
  );
}
