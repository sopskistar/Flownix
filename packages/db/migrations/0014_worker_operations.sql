CREATE TABLE worker_budget_usage (
  scope text NOT NULL,
  period_start timestamptz NOT NULL,
  used bigint NOT NULL DEFAULT 0 CHECK (used >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(scope,period_start)
);
CREATE TABLE worker_provider_state (
  provider text PRIMARY KEY,
  blocked_until timestamptz NOT NULL DEFAULT now(),
  failures integer NOT NULL DEFAULT 0,
  reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE worker_operational_alerts (
  code text PRIMARY KEY,
  severity text NOT NULL CHECK(severity IN ('warning','critical')),
  detail jsonb NOT NULL,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  notified_at timestamptz
);
CREATE INDEX worker_jobs_due_idx ON worker_jobs(run_after,kind);
CREATE INDEX provider_runs_recent_idx ON provider_runs(started_at);
