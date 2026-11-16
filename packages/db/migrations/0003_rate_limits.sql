CREATE TABLE api_rate_limits (key text PRIMARY KEY,window_start timestamptz NOT NULL,hits integer NOT NULL);
