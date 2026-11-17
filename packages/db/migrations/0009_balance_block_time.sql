ALTER TABLE wallet_balance_snapshots ADD COLUMN block_time timestamptz;
ALTER TABLE wallet_balance_snapshots ADD COLUMN decimals integer CHECK(decimals BETWEEN 0 AND 255);
UPDATE wallet_balance_snapshots b SET block_time=s.end_time FROM scan_windows s
 WHERE s.token_id=b.token_id AND s.to_block=b.block_number AND b.block_time IS NULL;
