# Manual Render release and one-message Telegram acceptance

The worker image includes the Telegram test command. This release needs no database migration.

## Release the verified commit manually

1. Require successful GitHub `checks` and Vercel status on the final pushed `main` SHA. Record that full SHA; do not assume Render follows GitHub. In the **existing** Render worker verify Auto-Deploy **Off**, one Starter instance, `TELEGRAM_ENABLED=false`, `TELEGRAM_RESEARCH_DIGEST_ENABLED=false` (default), duty interval **43200**, active bound **1500**, and all existing quotas/checkpoints unchanged. Keep credentials on Render.
2. In that worker's Shell, run `node --import tsx scripts/worker-health.ts` and inspect `cat /tmp/flownix-worker-health.json`. Require a recent `sleeping` phase, a future `nextAt`, no `lastFailure`, and health exit 0. If collecting or near the next wake, wait. The local health check does not wake Neon.
3. If needed, make **one** database inspection, not a polling loop:

   ```sql
   BEGIN READ ONLY;
   SELECT key,value FROM settings
   WHERE key IN ('worker_duty_cycle','worker_heartbeat');
   SELECT count(*) AS collector_locks FROM pg_locks
   WHERE locktype='advisory' AND classid=0 AND objid=726032 AND granted;
   COMMIT;
   ```

   Require successful idle duty state, future nextAt and zero locks. A stopped child heartbeat alone does not prove host liveness or Neon suspension.

4. Use Render **Manual Deploy → Deploy a specific commit**, with the verified full SHA from step 1. Do not change the start command, clear checkpoints, create another service or run `worker:once`/`worker:duty` yourself.
5. After deployment, open a new Shell and run `printenv RENDER_GIT_COMMIT`. Match it to the SHA in Render's deployment details. Look for `duty_reservation` with `run:false` and `reason:planned_idle` in the logs. Rerun the health check and confirm the worker is sleeping with the same future `nextAt`.

## Send exactly one application-generated test, while genuine alerts stay OFF

Under **flownix-worker → Environment**, verify that the service has `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` directly or through a group listed under **Linked Environment Groups**. Values saved with **Save only** take effect on the next deploy. Verify presence in the new worker Shell without displaying either secret:

```sh
cd /app
node -e 'const e=process.env; console.log({botTokenPresent:!!e.TELEGRAM_BOT_TOKEN,chatIdPresent:!!e.TELEGRAM_CHAT_ID,alertsOff:e.TELEGRAM_ENABLED==="false",digestsOff:(e.TELEGRAM_RESEARCH_DIGEST_ENABLED??"false")==="false"})'
```

Continue when all four values are `true`. Confirm that you saved the intended bot and private chat. The command verifies the configured bot identity and private chat through Telegram.

Generate one UUID and **record it**:

```sh
node -e 'console.log(require("node:crypto").randomUUID())'
```

Then substitute that same UUID once:

```sh
node --import tsx scripts/telegram-test.ts --send-one YOUR_RECORDED_UUID --confirm-private-target
```

Keep `TELEGRAM_ENABLED=false`. The command refuses genuine-alert mode, inserts/deduplicates one `telegram-test:UUID` row, and invokes the same delivery function used by the scheduled notification job with an exact test-row selector. It sends only `FLOWNIX TEST ONLY`, never drains other rows and never starts a collector. There is no need to wake the scheduled worker or move secrets to Vercel.

Read the result from Render Shell using the same UUID. This command only queries PostgreSQL and works without `psql` or Telegram credentials:

```sh
node --import tsx scripts/telegram-test.ts --status YOUR_RECORDED_UUID
```

Acceptance requires your private Telegram chat visibly receiving **one** marked message and that same row showing `delivered`, `attempts=1`, timestamp, and a JSON receipt containing `ok:true`, `message_id`, Telegram `date`, `privateTargetMatches:true` and response hash. The receipt deliberately omits token/chat ID and personal profile data. Do not paste credentials or entire environment output.

Repeated invocation with the **same UUID** cannot resend a claimed/delivered message. If status is `uncertain` or remains `sending` after interruption, **do not create a new UUID or reset the row**. A timeout can mean Telegram already accepted the message. Inspect your chat and reconcile the row manually; there is no automatic retry after an ambiguous send. A queued row with zero attempts can be retried with the same UUID after resolving metadata/provider problems. Confirm local worker health returns/remains sleeping afterward; the CLI closes its database connections.

## Enable genuine alerts only after the owner separately approves

The accepted application test is `80532dfd-21ad-49eb-ae96-5ad50cacfa90`, delivered once as Telegram message 5 on November 27, 2026 at 14:30:25 UTC. Use this receipt for activation. Proceed only after separate owner approval.

While sleeping with both flags false, use this transaction with the accepted test UUID. It refuses active collection and preserves all source evidence and delivery history:

```sql
BEGIN;
SET LOCAL lock_timeout='2s';
DO $$
DECLARE duty jsonb;
BEGIN
  IF NOT pg_try_advisory_xact_lock(726032) THEN
    RAISE EXCEPTION 'Collector active; wait';
  END IF;
  SELECT value INTO duty FROM settings WHERE key='worker_duty_cycle';
  IF duty->>'phase' IS DISTINCT FROM 'idle'
    OR duty->>'lastExitCode' IS DISTINCT FROM '0'
    OR duty->>'nextAt' IS NULL
    OR (duty->>'nextAt')::timestamptz<=now()+interval '10 minutes' THEN
    RAISE EXCEPTION 'Verified sleeping interval required';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM notification_deliveries
    WHERE id='telegram-test:80532dfd-21ad-49eb-ae96-5ad50cacfa90'
    AND channel='telegram' AND signal_id IS NULL AND status='delivered'
    AND payload->>'test'='true' AND payload->>'explicit'='true'
    AND delivered_at IS NOT NULL AND error IS NULL
    AND attempts=1 AND (receipt::jsonb)->>'ok'='true'
    AND (receipt::jsonb)->>'message_id'='5'
    AND (receipt::jsonb)->>'privateTargetMatches'='true') THEN
    RAISE EXCEPTION 'Accepted pipeline receipt required';
  END IF;
END $$;
UPDATE notification_deliveries SET status='cancelled',error='PRE_ACTIVATION_HISTORY'
WHERE channel='telegram' AND status='queued';
INSERT INTO settings(key,value) VALUES('telegram_activation',
  jsonb_build_object('since',now(),'acceptedTestId','telegram-test:80532dfd-21ad-49eb-ae96-5ad50cacfa90'))
ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now();
SELECT value->>'since' AS activation_cutoff FROM settings WHERE key='telegram_activation';
COMMIT;
```

After the transaction commits, open **flownix-worker → Environment**. Set `TELEGRAM_ENABLED=true` and `TELEGRAM_RESEARCH_DIGEST_ENABLED=false` using **Save only**. Keep the verified bot and chat values on this service. Keep the current `TELEGRAM_WATCHLIST_ONLY` setting: `true` restricts delivery to watched tokens and `false` (default) covers the Alpha universe. Keep Auto-Deploy **Off**. During the same sleeping interval, use **Manual Deploy → Deploy a specific commit** with the verified release SHA. Check `RENDER_GIT_COMMIT`, verify the flags in the new Shell, and confirm sleeping with the same `nextAt`. Check notifications after the next scheduled window.

Queueing and delivery require an activation cutoff and an active signal detected at or after the cutoff within the last 15 minutes. With digests off, only `supported` or `high` qualifies. Review the first genuine alert against its linked evidence. To pause delivery, save `TELEGRAM_ENABLED=false` and apply it during sleep. Preserve delivery records and attempts.

Manual deployments and environment application follow [Render deploy documentation](https://render.com/docs/deploys) and [environment configuration](https://render.com/docs/configure-environment-variables). Private targeting and receipts use the official [Telegram Bot API](https://core.telegram.org/bots/api).
