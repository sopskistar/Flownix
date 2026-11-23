CREATE TABLE live_scan_checkpoints (
 token_id text PRIMARY KEY REFERENCES alpha_tokens(id),chain_id text NOT NULL,
 block_number bigint NOT NULL,block_hash text NOT NULL,source_time timestamptz NOT NULL,
 observed_at timestamptz NOT NULL,window_from bigint NOT NULL,head_at_scan bigint NOT NULL
);
CREATE TABLE scan_gap_observations (
 token_id text NOT NULL REFERENCES alpha_tokens(id),from_block bigint NOT NULL,to_block bigint NOT NULL,
 observed_at timestamptz NOT NULL DEFAULT now(),reason text NOT NULL,
 PRIMARY KEY(token_id,from_block,to_block),CHECK(to_block>=from_block)
);
CREATE TABLE worker_job_observations (
 id uuid PRIMARY KEY,job_kind text NOT NULL,token_id text,chain_id text,
 started_at timestamptz NOT NULL,finished_at timestamptz NOT NULL,status text NOT NULL,
 error_code text,measurements jsonb NOT NULL
);
CREATE INDEX worker_job_observations_time ON worker_job_observations(finished_at DESC);
CREATE TABLE futures_listing_events (
 event_hash text PRIMARY KEY,token_id text NOT NULL REFERENCES alpha_tokens(id),
 symbol text NOT NULL,first_observed_at timestamptz NOT NULL DEFAULT now(),definition jsonb NOT NULL
);
CREATE TABLE event_study_runs (
 run_hash text PRIMARY KEY,spec_version text NOT NULL,computed_at timestamptz NOT NULL,
 manifest jsonb NOT NULL,report jsonb NOT NULL
);
