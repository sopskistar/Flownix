-- Evidence-driven deep investigation queue. No universe or signal quota.
CREATE TABLE token_investigation_queue (
  token_id text PRIMARY KEY REFERENCES alpha_tokens(id),
  priority integer NOT NULL DEFAULT 100,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  first_queued_at timestamptz NOT NULL DEFAULT now(),
  last_queued_at timestamptz NOT NULL DEFAULT now(),
  last_investigated_at timestamptz,
  next_investigation_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  resolved_at timestamptz
);
CREATE INDEX token_investigation_due ON token_investigation_queue(priority,next_investigation_at,token_id) WHERE active;
