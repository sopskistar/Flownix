CREATE TABLE solana_balance_observations (
 id bigserial PRIMARY KEY,
 token_id text NOT NULL REFERENCES alpha_tokens(id),
 token_account text NOT NULL,
 owner_address text,
 signature text,
 slot bigint NOT NULL,
 block_time timestamptz,
 observation_type text NOT NULL CHECK(observation_type IN ('top_holder_snapshot','transaction_delta')),
 pre_raw numeric(78,0),
 post_raw numeric(78,0),
 delta_raw numeric(79,0),
 decimals integer NOT NULL CHECK(decimals BETWEEN 0 AND 255),
 observed_at timestamptz NOT NULL,
 source text NOT NULL,
 response_hash text NOT NULL,
 canonical boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX solana_balance_snapshot_identity ON solana_balance_observations(token_id,token_account,slot) WHERE signature IS NULL;
CREATE UNIQUE INDEX solana_balance_tx_identity ON solana_balance_observations(token_id,token_account,signature) WHERE signature IS NOT NULL;
CREATE INDEX solana_balance_owner_history ON solana_balance_observations(token_id,owner_address,slot DESC) WHERE canonical;
CREATE TABLE solana_account_cursors (
 token_id text NOT NULL REFERENCES alpha_tokens(id),
 token_account text NOT NULL,
 last_signature text NOT NULL,
 last_slot bigint NOT NULL,
 scanned_at timestamptz NOT NULL,
 coverage_gap boolean NOT NULL DEFAULT false,
 PRIMARY KEY(token_id,token_account)
);
