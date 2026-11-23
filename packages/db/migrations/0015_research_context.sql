CREATE TABLE worker_chain_turns(chain_id text PRIMARY KEY,last_claimed_at timestamptz NOT NULL);
ALTER TABLE wallet_relationships ADD COLUMN research_key text UNIQUE;
ALTER TABLE wallet_relationships ADD COLUMN token_id text REFERENCES alpha_tokens(id);
ALTER TABLE holder_metrics ADD COLUMN canonical boolean NOT NULL DEFAULT true;
CREATE TABLE research_feature_snapshots(
 feature_hash text PRIMARY KEY,kind text NOT NULL,computed_at timestamptz NOT NULL,
 available_at timestamptz NOT NULL,evidence jsonb NOT NULL
);
CREATE TABLE research_leads (
 id uuid PRIMARY KEY,token_id text NOT NULL REFERENCES alpha_tokens(id),kind text NOT NULL,
 source_url text NOT NULL,author text NOT NULL DEFAULT '',body text NOT NULL,
 claimed_published_at timestamptz,claimed_event_at timestamptz,
 first_observed_at timestamptz NOT NULL DEFAULT now(),published_at timestamptz,verified_at timestamptz,
 revision_of uuid REFERENCES research_leads(id),status text NOT NULL DEFAULT 'manual_lead',
 CHECK(status IN ('manual_lead','verified_source','contradicted','withdrawn'))
);
CREATE INDEX research_leads_token ON research_leads(token_id,first_observed_at DESC);
CREATE TABLE futures_associations (
 token_id text PRIMARY KEY REFERENCES alpha_tokens(id),symbol text NOT NULL,base_asset text NOT NULL,contract_type text NOT NULL,
 multiplier numeric NOT NULL CHECK(multiplier>0),token_source text NOT NULL,instrument_source text NOT NULL,
 verified_at timestamptz NOT NULL,valid_from timestamptz NOT NULL,valid_to timestamptz,
 evidence jsonb NOT NULL
);
CREATE TABLE derivatives_observations (
 token_id text NOT NULL REFERENCES alpha_tokens(id),symbol text NOT NULL,observed_at timestamptz NOT NULL,
 provider_time timestamptz NOT NULL,evidence jsonb NOT NULL,
 PRIMARY KEY(token_id,symbol,observed_at)
);
CREATE TABLE pool_liquidity_observations (
 token_id text NOT NULL REFERENCES alpha_tokens(id),chain_id text NOT NULL,pool_address text NOT NULL,
 block_number bigint NOT NULL,block_hash text NOT NULL,block_time timestamptz NOT NULL,
 available_at timestamptz NOT NULL,evidence jsonb NOT NULL,canonical boolean NOT NULL DEFAULT true,
 PRIMARY KEY(token_id,chain_id,pool_address,block_number)
);
CREATE INDEX holder_metrics_token ON holder_metrics(token_id,observed_at DESC);
