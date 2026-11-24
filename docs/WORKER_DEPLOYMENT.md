> Current strict-$7 handoff: [bounded collection and launch guide](SEVEN_DOLLAR_LAUNCH.md). The dated continuous-worker capacity assumptions below are preserved; use the new duty profile for Neon Free.

> Current milestone: [24/7 worker readiness and cost controls (2026-11-22)](WORKER_READINESS_2026-11-22.md). This supersedes older cost/coverage snapshots below; hosting remains unactivated pending approval.

# Portable private worker — deployment deferred

No worker host has been approved. These are prepared procedures, **not evidence of deployment**. Vercel continues to host flownix.xyz, and the existing Neon database is the only production database. Never activate a paid plan without the owner's approval.

## Same application on every host

The shared `Dockerfile.worker` uses Node 22 Alpine and pnpm's frozen lockfile. Build natively on AMD64 or ARM64; AMD64 was built successfully locally, ARM64 execution is still unverified. No `EXPOSE`, HTTP server, public health route or Docker published port is required. Linux, Railway and Render use the exact same collector entry point. Health is a database-heartbeat CLI, not a new API.

```sh
docker build -f Dockerfile.worker -t flownix-worker:YOUR_COMMIT .
docker run --rm --env-file .env.worker.local flownix-worker:YOUR_COMMIT node --import tsx scripts/collection-status.ts
```

Builds need network/DNS access to official npm/Docker registries. The first local build failed because WSL/Docker DNS could not resolve registry.npmjs.org. A local-only build retry used a freshly DNS-resolved npm address with Docker `--add-host`, preserving hostname/TLS. This is not a production IP pin or proxy. Diagnose a cloud host's own resolver before copying a WSL repair.

## Secrets and database target

Create an ignored owner-only `.env.worker.local` (`chmod 600`). Copy the existing pooled Neon URL to `DATABASE_URL` and its direct/unpooled URL to `DATABASE_URL_WORKER`. Keep TLS required. RPC URLs belong only here/service secret settings. Do not copy GitHub OAuth/session credentials into the collector. Paid enrichment stays OFF and budget 0. No wallet signing/trading keys are used.

Verify that both URLs name the **same existing Neon endpoint/database/user** (pooler hostname has `-pooler`); never print them. Then check safe SQL persistence in separate processes:

```sh
node --env-file=.env.worker.local --import tsx scripts/db-verify.ts write direct worker-check-unique
node --env-file=.env.worker.local --import tsx scripts/db-verify.ts read direct worker-check-unique
node --env-file=.env.worker.local --import tsx scripts/db-verify.ts write pooled worker-check-unique
node --env-file=.env.worker.local --import tsx scripts/db-verify.ts read pooled worker-check-unique
```

This release's nine migrations are already applied to the intended production Neon database. For future additive migrations, verify endpoint identity/current schema first, review changes and backup policy, then run `node --env-file=.env.worker.local --import tsx packages/db/src/migrate.ts`. No reset command is part of deployment. The migration ledger and transaction advisory lock prevent duplicate application; they do not substitute for verifying the target.

## Linux VM after explicit approval

SSH uses a public address or configured alias and the local SSH agent/key path. Never send a key's contents or a cloud password. Verify the VM host fingerprint through the cloud console before its first SSH connection; the deployment script requires a trusted known_hosts entry and refuses agent forwarding.

```sh
node scripts/deploy-worker-ssh.mjs --target ubuntu@YOUR_APPROVED_HOST --identity /local/path/to/key --platform digitalocean --phase preflight
node scripts/deploy-worker-ssh.mjs --target ubuntu@YOUR_APPROVED_HOST --identity /local/path/to/key --platform digitalocean --phase host --host-approved
node scripts/deploy-worker-ssh.mjs --target ubuntu@YOUR_APPROVED_HOST --identity /local/path/to/key --platform digitalocean --phase release --host-approved
node scripts/deploy-worker-ssh.mjs --target ubuntu@YOUR_APPROVED_HOST --identity /local/path/to/key --platform digitalocean --phase activate --host-approved
node scripts/deploy-worker-ssh.mjs --target ubuntu@YOUR_APPROVED_HOST --identity /local/path/to/key --platform digitalocean --phase status
```

These mutation flags are not current authorization. Release/activate require a clean committed checkout. The script uploads the exact Git archive, filters worker secrets over SSH stdin into root-only `/etc/flownix/worker.env`, builds on the VM, verifies the existing database target, applies additive migrations and runs provider/persistence checks before activation. Activation requires that release's verification marker. Review failed checks before proceeding. Oracle additionally requires `--platform oracle --always-free-confirmed` after console eligibility/account approval; no Oracle resources are provisioned by the script. Generic host bootstrap supports Ubuntu AMD64 and ARM64, reuses Docker if installed and creates no PostgreSQL server or firewall rules. All VM providers share it.

`deploy/linux/flownix-worker.service` supervises one foreground Docker process. The container has a 768 MiB memory cap, 0.75 CPU cap, nonroot user, dropped capabilities, read-only root, temporary /tmp and three rotated 10 MB logs. Use a host with sufficient OS/build headroom. systemd is the restart owner; do not layer an independent Docker restart policy onto it. The database advisory lock prevents overlapping collectors, including during rollback. A paused/failed contender must not overwrite the active worker's heartbeat.

Useful approved-host commands:

```sh
sudo systemctl status flownix-worker --no-pager
sudo journalctl -u flownix-worker --since '30 minutes ago' --no-pager
sudo docker stats --no-stream flownix-worker
sudo docker exec flownix-worker node --import tsx scripts/worker-health.ts
sudo systemctl restart flownix-worker
```

Health success means a fresh unstopped heartbeat exists. It does not prove RPC data is advancing. Verify actual cursor/block/event times, queued errors, source evidence and provider success in Data Health. After restart, confirm exactly one advisory lock and a new heartbeat owner, replay a real window without duplicate events, then observe cursor advancement. Current public RPC failures prevent that full live acceptance; do not mark a deployed process fully operational until resolved.

For rollback: stop the service, set the prior verified image tag in root-only `/etc/flownix/release.env`, restart, and verify heartbeat/compatibility. Do not roll back database migrations destructively or delete cursors. A code rollback requires schema compatibility review.

## Managed container host after explicit approval

Railway: connect the existing repository, set repository-root build context and `Dockerfile.worker`, use its CMD, one replica, no domain/HTTP health path, scale-to-zero disabled, server-side worker variables only. Render: choose **Background Worker**, Docker runtime, root context and the same Dockerfile/CMD; choose the approved compute plan and environment secrets. Neither needs a hosted Postgres add-on or persistent filesystem disk. Review provider logs/metrics, spending limits, restart policy and region before deployment. A rollout contender exits if another collector holds the lock; stop the previous revision before completing handover.

## Concepts for handover/interviews

- **SSH** authenticates an administrator with a local private key and encrypts commands. The server's host key identifies the VM; checking its fingerprint prevents connecting to an impostor.
- **ARM64 vs AMD64** describes CPU instruction sets. The same TypeScript source works on both, but Node and native packages must be built for the selected architecture. A cross-platform Dockerfile is not proof that both executions were tested.
- **Background worker** is a persistent process independent of a browser or Vercel request. It makes outbound HTTPS RPC/API requests and TLS PostgreSQL connections; it needs no incoming public HTTP port.
- **Neon/PostgreSQL persistence** retains evidence and checkpoints after a process/VM disappears. A direct database session keeps the advisory lock; a transaction pooler is suitable for short web queries but cannot safely stand in for that session lock.
- **Environment variables** inject server-side configuration at runtime. They are not encrypted by themselves: restrict files/platform access and never log full URLs or inspect a container's complete environment in shared output.
- **systemd/restart policies** restart failed processes and start at boot. Leases allow interrupted jobs to be retried; unique event keys and preserved first-availability timestamps prevent duplicate research evidence.
- **Monitoring** separates process heartbeat, provider success and data lag. CPU/RAM/log metrics find resource pressure; cursor lag and suppression traces establish whether collection and research are actually current.
- **Retry/backoff/rate limits** space attempts and bound failures to protect providers and budgets. Catch-up resumes saved block windows rather than silently jumping to the latest block or rescanning unlimited history.
- **DNS/TLS** first resolve an official hostname, then authenticate/encrypt its connection. Repairing a resolver does not justify bypassing access restrictions or disabling certificate checks.
- **CI/CD** runs fixture/database/browser checks on GitHub; deployment uses a verified revision. Mock tests do not certify live provider access. Incident recovery preserves evidence, diagnoses failure codes, then verifies restart/cursor progress before announcing recovery.
