ALTER TABLE source_responses ADD COLUMN raw_text text;
UPDATE source_responses SET raw_text=payload #>> '{}' WHERE jsonb_typeof(payload)='string';
-- Repair development observations written as JSON text, without changing valid scalar settings.
DO $$
DECLARE item record;
BEGIN
 FOR item IN SELECT * FROM (VALUES
 ('alpha_tokens','metadata'),('alpha_membership_snapshots','raw'),('alpha_membership_snapshots','changes'),
 ('market_symbols','raw'),('source_responses','payload'),('market_snapshots','raw'),('market_snapshots','book'),
 ('signal_events','thresholds'),('signal_events','observed'),('signal_events','counter_evidence'),
 ('notification_deliveries','payload'),('paper_trades','assumptions'),('worker_jobs','payload'),
 ('settings','value'),('research_state_history','evidence'),('accumulation_observations','coverage'),
 ('accumulation_observations','metrics'),('signal_outcomes','evidence')
 ) AS columns_to_repair(table_name,column_name)
 LOOP
  EXECUTE format('UPDATE %I SET %I=(%I #>> ''{}'')::jsonb WHERE jsonb_typeof(%I)=''string'' AND (left(ltrim(%I #>> ''{}''),1) IN (''{'',''['') OR (%I #>> ''{}'') IN (''true'',''false''))',item.table_name,item.column_name,item.column_name,item.column_name,item.column_name,item.column_name);
 END LOOP;
END $$;
