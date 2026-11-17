CREATE TABLE provider_diagnostics (
 id bigserial PRIMARY KEY, environment text NOT NULL, checked_at timestamptz NOT NULL,
 report jsonb NOT NULL
);
CREATE TABLE detection_traces (
 id bigserial PRIMARY KEY, token_id text NOT NULL REFERENCES alpha_tokens(id),
 from_block bigint NOT NULL,to_block bigint NOT NULL,computed_at timestamptz NOT NULL,
 rule_version text NOT NULL,reason text NOT NULL,evidence jsonb NOT NULL
);
CREATE INDEX detection_trace_token ON detection_traces(token_id,computed_at DESC);
CREATE TABLE receipt_evidence (
 chain_id text NOT NULL,tx_hash text NOT NULL,block_hash text NOT NULL,
 token_id text NOT NULL REFERENCES alpha_tokens(id),block_number bigint NOT NULL,
 observed_at timestamptz NOT NULL,response_hash text NOT NULL,source text NOT NULL,
 canonical boolean NOT NULL DEFAULT true,evidence jsonb NOT NULL,
 PRIMARY KEY(chain_id,tx_hash,block_hash)
);
