ALTER TABLE watchlists ADD COLUMN archived boolean NOT NULL DEFAULT false;
ALTER TABLE watchlists ADD COLUMN thesis text NOT NULL DEFAULT '';
ALTER TABLE alpha_tokens ADD COLUMN research_state text NOT NULL DEFAULT 'DISCOVERY';
CREATE TABLE research_state_history(id bigserial PRIMARY KEY,token_id text NOT NULL REFERENCES alpha_tokens(id),from_state text,to_state text NOT NULL,observed_at timestamptz NOT NULL,rule_version text NOT NULL,evidence jsonb NOT NULL,reason text NOT NULL);
CREATE INDEX research_history_token ON research_state_history(token_id,observed_at DESC);
CREATE TABLE accumulation_observations(token_id text NOT NULL REFERENCES alpha_tokens(id),window_days integer NOT NULL,computed_at timestamptz NOT NULL,window_start timestamptz NOT NULL,window_end timestamptz NOT NULL,coverage jsonb NOT NULL,metrics jsonb NOT NULL,PRIMARY KEY(token_id,window_days,computed_at));
