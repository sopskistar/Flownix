import { Suspense } from "react";
import { health, safeRadar } from "../../lib/data";
import { requireAccess } from "../../lib/auth";
import { Radar } from "../../components/radar";
export default async function Home() {
  await requireAccess();
  const [h, tokens] = await Promise.all([health(), safeRadar()]);
  return (
    <Suspense fallback={<p>Loading universe…</p>}>
      <Radar tokens={tokens} health={h} />
    </Suspense>
  );
}
