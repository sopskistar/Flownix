"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="notice">
      <h1>Research data is unavailable</h1>
      <p>
        Check PostgreSQL, migrations and worker status with pnpm run doctor.
        Saved observations are preserved.
      </p>
      <button onClick={reset}>Try again</button>
    </section>
  );
}
