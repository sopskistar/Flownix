CREATE TABLE token_dex_pools (
 token_id text NOT NULL REFERENCES alpha_tokens(id),chain_id text NOT NULL,address text NOT NULL,
 observed_at timestamptz NOT NULL,verified_at_block bigint NOT NULL,evidence jsonb NOT NULL,
 PRIMARY KEY(token_id,chain_id,address),FOREIGN KEY(chain_id,address) REFERENCES dex_pools(chain_id,address)
);
CREATE TABLE verified_swaps (
 chain_id text NOT NULL,tx_hash text NOT NULL,log_index integer NOT NULL,token_id text NOT NULL REFERENCES alpha_tokens(id),
 pool_address text NOT NULL,block_number bigint NOT NULL,block_hash text NOT NULL,event_time timestamptz NOT NULL,
 available_at timestamptz NOT NULL,side text NOT NULL CHECK(side IN ('buy','sell')),actor text,
 raw_quantity numeric(78,0) NOT NULL,quote_contract text NOT NULL,raw_quote numeric(78,0) NOT NULL,
 classification text NOT NULL,canonical boolean NOT NULL DEFAULT true,evidence jsonb NOT NULL,
 PRIMARY KEY(chain_id,tx_hash,log_index,token_id)
);
CREATE INDEX verified_swap_wallet ON verified_swaps(chain_id,actor,event_time DESC);
CREATE INDEX verified_swap_token ON verified_swaps(token_id,event_time DESC);
CREATE TABLE swap_scan_windows (
 token_id text NOT NULL REFERENCES alpha_tokens(id),chain_id text NOT NULL,pool_address text NOT NULL,
 from_block bigint NOT NULL,to_block bigint NOT NULL,observed_at timestamptz NOT NULL,
 event_count integer NOT NULL,decoded_count integer NOT NULL,attributed_count integer NOT NULL,
 complete boolean NOT NULL,reason text NOT NULL,
 PRIMARY KEY(token_id,chain_id,pool_address,from_block,to_block)
);
CREATE TABLE wallet_monitoring (
 token_id text NOT NULL REFERENCES alpha_tokens(id),chain_id text NOT NULL,address text NOT NULL,
 added_at timestamptz NOT NULL DEFAULT now(),reason text NOT NULL,added_by text NOT NULL,
 active boolean NOT NULL DEFAULT true,PRIMARY KEY(token_id,chain_id,address)
);
CREATE TABLE wallet_research_observations (
 token_id text NOT NULL REFERENCES alpha_tokens(id),chain_id text NOT NULL,address text NOT NULL,
 window_days integer NOT NULL,computed_at timestamptz NOT NULL,evidence jsonb NOT NULL,
 PRIMARY KEY(token_id,chain_id,address,window_days,computed_at)
);
CREATE TABLE research_case_candidates (
 token_id text PRIMARY KEY REFERENCES alpha_tokens(id),source text NOT NULL,observed_at timestamptz NOT NULL,
 hypothesis text NOT NULL,evidence jsonb NOT NULL
);
