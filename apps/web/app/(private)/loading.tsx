export default function Loading() {
  return (
    <section aria-busy="true" aria-label="Loading research workspace">
      <p className="loading-title" role="status" aria-live="polite">
        Loading observations…
      </p>
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
    </section>
  );
}
