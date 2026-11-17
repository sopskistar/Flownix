CREATE TABLE market_coverage (
 token_id text PRIMARY KEY REFERENCES alpha_tokens(id),
 pair_symbol text,
 quote_asset text,
 status text NOT NULL CHECK(status IN ('observed','no_pair','error')),
 provider text NOT NULL,
 checked_at timestamptz NOT NULL,
 observed_at timestamptz,
 error_code text,
 raw jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX market_coverage_status_checked ON market_coverage(status,checked_at);
