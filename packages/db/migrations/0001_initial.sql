CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE alpha_tokens (
 id text PRIMARY KEY, chain_id text NOT NULL, contract text NOT NULL, symbol text NOT NULL, name text NOT NULL,
 token_id text NOT NULL, alpha_id text, status text NOT NULL CHECK(status IN ('current','offline','removed','unknown')),
 listing_time timestamptz, first_seen timestamptz NOT NULL, last_seen timestamptz NOT NULL,
 source text NOT NULL, response_hash text NOT NULL, metadata jsonb NOT NULL, deep_selected boolean NOT NULL DEFAULT false,
 UNIQUE(chain_id,contract)
);
CREATE INDEX alpha_status_chain ON alpha_tokens(status,chain_id);
CREATE INDEX alpha_identifier ON alpha_tokens(alpha_id);
CREATE TABLE alpha_membership_snapshots (id bigserial PRIMARY KEY, observed_at timestamptz NOT NULL, source text NOT NULL, response_hash text NOT NULL, raw jsonb NOT NULL, token_count integer NOT NULL, changes jsonb NOT NULL);
CREATE TABLE market_symbols (symbol text PRIMARY KEY, alpha_id text NOT NULL, quote_asset text NOT NULL, status text, active boolean NOT NULL DEFAULT true, observed_at timestamptz NOT NULL, raw jsonb NOT NULL);
CREATE INDEX market_alpha ON market_symbols(alpha_id);
CREATE TABLE source_responses (hash text PRIMARY KEY, provider text NOT NULL, source text NOT NULL, observed_at timestamptz NOT NULL, server_date text, payload jsonb NOT NULL);
CREATE TABLE market_snapshots (id bigserial PRIMARY KEY, token_id text NOT NULL REFERENCES alpha_tokens(id), symbol text, source text NOT NULL, source_kind text NOT NULL, quote_asset text, observed_at timestamptz NOT NULL, provider_time timestamptz, price numeric, change_24h numeric, volume_24h numeric, liquidity numeric, market_cap numeric, response_hash text NOT NULL, raw jsonb NOT NULL);
CREATE INDEX market_token_time ON market_snapshots(token_id,observed_at DESC);
CREATE TABLE ohlcv_candles (symbol text NOT NULL, interval text NOT NULL, open_at timestamptz NOT NULL, close_at timestamptz NOT NULL, available_at timestamptz NOT NULL, open numeric NOT NULL, high numeric NOT NULL, low numeric NOT NULL, close numeric NOT NULL, volume numeric NOT NULL, quote_volume numeric, source text NOT NULL, response_hash text NOT NULL, PRIMARY KEY(symbol,interval,open_at));
CREATE TABLE dex_pools (chain_id text NOT NULL, address text NOT NULL, token_id text REFERENCES alpha_tokens(id), source text NOT NULL, observed_at timestamptz NOT NULL, evidence jsonb NOT NULL, PRIMARY KEY(chain_id,address));
CREATE TABLE wallets (chain_id text NOT NULL,address text NOT NULL,first_seen timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(chain_id,address));
CREATE TABLE wallet_labels (id bigserial PRIMARY KEY,chain_id text NOT NULL,address text NOT NULL,role text NOT NULL,entity text,source_url text NOT NULL,confidence text NOT NULL,valid_from timestamptz NOT NULL,valid_to timestamptz,added_by text NOT NULL,reviewed_by text,notes text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX labels_wallet ON wallet_labels(chain_id,address);
CREATE TABLE token_transfers (chain_id text NOT NULL,tx_hash text NOT NULL,log_index integer NOT NULL,token_id text NOT NULL REFERENCES alpha_tokens(id),block_number bigint NOT NULL,block_hash text NOT NULL,event_time timestamptz NOT NULL,available_at timestamptz NOT NULL,from_address text NOT NULL,to_address text NOT NULL,raw_quantity numeric(78,0) NOT NULL,decimals integer NOT NULL,kind text NOT NULL,source text NOT NULL,canonical boolean NOT NULL DEFAULT true,PRIMARY KEY(chain_id,tx_hash,log_index));
CREATE INDEX transfers_token_block ON token_transfers(token_id,block_number);
CREATE INDEX transfers_from ON token_transfers(chain_id,from_address,event_time DESC);
CREATE INDEX transfers_to ON token_transfers(chain_id,to_address,event_time DESC);
CREATE TABLE block_cursors (token_id text PRIMARY KEY REFERENCES alpha_tokens(id),chain_id text NOT NULL,block_number bigint NOT NULL,block_hash text NOT NULL,scanned_at timestamptz NOT NULL);
CREATE TABLE scan_windows (token_id text NOT NULL REFERENCES alpha_tokens(id),from_block bigint NOT NULL,to_block bigint NOT NULL,start_time timestamptz NOT NULL,end_time timestamptz NOT NULL,available_at timestamptz NOT NULL,count integer NOT NULL,complete boolean NOT NULL,PRIMARY KEY(token_id,from_block,to_block));
CREATE TABLE dex_trades (chain_id text NOT NULL,event_id text NOT NULL,token_id text REFERENCES alpha_tokens(id),pool_address text NOT NULL,event_time timestamptz NOT NULL,available_at timestamptz NOT NULL,evidence jsonb NOT NULL,PRIMARY KEY(chain_id,event_id));
CREATE TABLE wallet_balance_snapshots (id bigserial PRIMARY KEY,chain_id text NOT NULL,address text NOT NULL,token_id text NOT NULL REFERENCES alpha_tokens(id),block_number bigint NOT NULL,block_hash text NOT NULL,raw_quantity numeric(78,0) NOT NULL,observed_at timestamptz NOT NULL,source text NOT NULL,UNIQUE(chain_id,address,token_id,block_hash));
CREATE TABLE wallet_relationships (id bigserial PRIMARY KEY,chain_id text NOT NULL,address_a text NOT NULL,address_b text NOT NULL,rule text NOT NULL,confidence text NOT NULL,evidence jsonb NOT NULL,observed_at timestamptz NOT NULL);
CREATE TABLE holder_metrics (id bigserial PRIMARY KEY,token_id text REFERENCES alpha_tokens(id),observed_at timestamptz NOT NULL,coverage text NOT NULL,evidence jsonb NOT NULL);
CREATE TABLE entity_flows (id bigserial PRIMARY KEY,token_id text REFERENCES alpha_tokens(id),entity text NOT NULL,window_start timestamptz NOT NULL,window_end timestamptz NOT NULL,coverage text NOT NULL,evidence jsonb NOT NULL);
CREATE TABLE signal_events (id text PRIMARY KEY,token_id text NOT NULL REFERENCES alpha_tokens(id),kind text NOT NULL,rule_version text NOT NULL,stage text NOT NULL,first_detected_at timestamptz NOT NULL,computed_at timestamptz NOT NULL,data_available_at timestamptz NOT NULL,price_at_detection numeric,quote_asset text,market_snapshot_id bigint REFERENCES market_snapshots(id),evidence_confidence text NOT NULL,opportunity_score numeric,status text NOT NULL DEFAULT 'active',thresholds jsonb NOT NULL,observed jsonb NOT NULL,counter_evidence jsonb NOT NULL,message text NOT NULL,UNIQUE(token_id,kind,first_detected_at));
CREATE INDEX signals_time ON signal_events(first_detected_at DESC);
CREATE TABLE signal_evidence (signal_id text REFERENCES signal_events(id),chain_id text NOT NULL,tx_hash text NOT NULL,log_index integer NOT NULL,PRIMARY KEY(signal_id,chain_id,tx_hash,log_index));
CREATE TABLE signal_outcomes (signal_id text REFERENCES signal_events(id),horizon_hours integer NOT NULL,computed_at timestamptz NOT NULL,evidence jsonb NOT NULL,PRIMARY KEY(signal_id,horizon_hours));
CREATE TABLE watchlists (token_id text PRIMARY KEY REFERENCES alpha_tokens(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE notification_deliveries (id text PRIMARY KEY,signal_id text REFERENCES signal_events(id),channel text NOT NULL,status text NOT NULL,attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now(),delivered_at timestamptz,receipt text,error text,payload jsonb NOT NULL,UNIQUE(signal_id,channel));
CREATE TABLE paper_trades (id text PRIMARY KEY,token_id text NOT NULL REFERENCES alpha_tokens(id),signal_id text REFERENCES signal_events(id),created_at timestamptz NOT NULL DEFAULT now(),entry_at timestamptz NOT NULL,entry_snapshot_id bigint REFERENCES market_snapshots(id),quote_asset text NOT NULL,entry_price numeric NOT NULL,notional numeric NOT NULL,quantity numeric NOT NULL,assumptions jsonb NOT NULL,status text NOT NULL DEFAULT 'open',exit_price numeric,exit_at timestamptz,net_pnl numeric,note text NOT NULL DEFAULT '');
CREATE TABLE provider_runs (id bigserial PRIMARY KEY,provider text NOT NULL,started_at timestamptz NOT NULL,finished_at timestamptz NOT NULL DEFAULT now(),ok boolean NOT NULL,http_status integer,error text,latency_ms integer NOT NULL DEFAULT 0,cost_usd numeric NOT NULL DEFAULT 0);
CREATE INDEX provider_time ON provider_runs(provider,started_at DESC);
CREATE TABLE worker_jobs (key text PRIMARY KEY,kind text NOT NULL,payload jsonb NOT NULL DEFAULT '{}',status text NOT NULL DEFAULT 'queued',attempts integer NOT NULL DEFAULT 0,run_after timestamptz NOT NULL DEFAULT now(),lease_until timestamptz,owner text,last_error text,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE data_quality_issues (id bigserial PRIMARY KEY,token_id text REFERENCES alpha_tokens(id),provider text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),kind text NOT NULL,detail text NOT NULL,resolved_at timestamptz);
CREATE TABLE settings (key text PRIMARY KEY,value jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE manual_research_notes (id bigserial PRIMARY KEY,token_id text REFERENCES alpha_tokens(id),signal_id text REFERENCES signal_events(id),chain_id text,address text,body text NOT NULL,source_url text,created_at timestamptz NOT NULL DEFAULT now(),added_by text NOT NULL);
CREATE TABLE api_budgets (provider text NOT NULL,day date NOT NULL,reserved_usd numeric NOT NULL DEFAULT 0,spent_usd numeric NOT NULL DEFAULT 0,PRIMARY KEY(provider,day));
