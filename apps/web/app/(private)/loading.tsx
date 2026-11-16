export default function Loading() {
  return (
    <section aria-busy="true" aria-label="Loading research workspace">
      <h1>Loading observations…</h1>
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
    </section>
  );
}
