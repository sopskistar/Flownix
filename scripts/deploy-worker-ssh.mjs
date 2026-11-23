import { readFileSync, existsSync } from "node:fs";
import { parseEnv } from "node:util";
import { spawn, execFileSync } from "node:child_process";
import { pipeline } from "node:stream/promises";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1];
};
const target = option("--target", process.env.FLOWNIX_SSH_TARGET);
const key = option("--identity", process.env.FLOWNIX_SSH_IDENTITY);
const phase = option("--phase", "preflight");
const platform = option("--platform", "linux");
if (
  !target ||
  !/^[a-zA-Z0-9][a-zA-Z0-9_.@:-]*$/.test(target) ||
  !["preflight", "host", "release", "activate", "status"].includes(phase) ||
  !["linux", "oracle", "digitalocean", "gcp", "aws"].includes(platform)
) {
  console.error(
    "Usage: node scripts/deploy-worker-ssh.mjs --target ubuntu@VM_IP_OR_SSH_ALIAS [--identity /local/key] --phase preflight|host|release|activate|status --platform linux|oracle|digitalocean|gcp|aws [--host-approved] [--always-free-confirmed]",
  );
  process.exit(1);
}
if (key && !existsSync(key)) {
  console.error(
    "Local SSH identity file is missing; never paste its contents.",
  );
  process.exit(1);
}
const sshArgs = [
  "-o",
  "BatchMode=yes",
  "-o",
  "StrictHostKeyChecking=yes",
  "-o",
  "ConnectTimeout=10",
  "-o",
  "ForwardAgent=no",
  ...(key ? ["-i", key] : []),
  target,
];
function ssh(command, input) {
  return new Promise((resolve, reject) => {
    const p = spawn("ssh", [...sshArgs, command], {
      stdio: ["pipe", "inherit", "inherit"],
    });
    p.on("error", () => reject(Error("SSH_START_FAILED")));
    p.on("exit", (code) =>
      code === 0 ? resolve() : reject(Error("SSH_COMMAND_FAILED")),
    );
    p.stdin.end(input);
  });
}
function workerEnvironment() {
  const env = parseEnv(readFileSync(".env.worker.local", "utf8"));
  const allowed = new Set([
    "DATABASE_URL",
    "DATABASE_URL_WORKER",
    "BSC_RPC_URL",
    "ETH_RPC_URL",
    "BASE_RPC_URL",
    "ARBITRUM_RPC_URL",
    "SONIC_RPC_URL",
    "ROBINHOOD_RPC_URL",
    "SOLANA_RPC_URL",
    "SCAN_BLOCKS",
    "SCAN_CONFIRMATIONS",
    "MARKET_TOKEN_LIMIT",
    "BASELINE_SCAN_INTERVAL_SECONDS",
    "SOLANA_BASELINE_INTERVAL_SECONDS",
    "SOLANA_TOP_ACCOUNTS_PER_TOKEN",
    "SOLANA_HISTORY_SIGNATURES_PER_ACCOUNT",
    "ALPHA_REQUESTS_PER_MINUTE",
    "PASSIVE_SWAPS_ENABLED",
    "SWAP_RECEIPTS_PER_WINDOW",
    "DATABASE_STORAGE_LIMIT_MB",
    "ALPHA_DAILY_REQUEST_LIMIT",
    "FUTURES_DAILY_REQUEST_LIMIT",
    "RPC_DAILY_REQUEST_LIMIT",
    "ALCHEMY_DAILY_CU_LIMIT",
    "ALCHEMY_MONTHLY_CU_LIMIT",
    "ALCHEMY_MONTHLY_UNTRACKED_CU",
    "ALCHEMY_ENRICHMENT_DAILY_CU_LIMIT",
    "ALCHEMY_HISTORICAL_DAILY_CU_LIMIT",
    "ENRICHMENT_WALLETS_PER_WINDOW",
    "WORKER_MARKET_OVERLAP",
    "WORKER_JOB_TIMEOUT_SECONDS",
    "WORKER_STARTUP_TIMEOUT_SECONDS",
    "TRANSFER_MIN_EVENTS",
    "TRANSFER_BASELINE_MULTIPLIER",
    "TRANSFER_BASELINE_WINDOWS",
    "SIGNAL_COOLDOWN_MINUTES",
    "MIN_LIQUIDITY_USD",
    "MAX_DATA_AGE_SECONDS",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID",
    "TELEGRAM_ENABLED",
    "TELEGRAM_WATCHLIST_ONLY",
    "PAID_ENRICHMENT_ENABLED",
    "PAID_DAILY_BUDGET_USD",
  ]);
  const direct = env.DATABASE_URL_WORKER;
  if (!direct) throw Error("DIRECT_DATABASE_URL_MISSING");
  const url = new URL(direct);
  const pooled = new URL(env.DATABASE_URL ?? "");
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["postgres:", "postgresql:"].includes(pooled.protocol) ||
    pooled.hostname.replace("-pooler", "") !== url.hostname ||
    pooled.pathname !== url.pathname ||
    pooled.username !== url.username ||
    !["require", "verify-full"].includes(pooled.searchParams.get("sslmode")) ||
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.hostname.includes("-pooler") ||
    !["require", "verify-full"].includes(url.searchParams.get("sslmode"))
  )
    throw Error("REMOTE_DIRECT_TLS_DATABASE_REQUIRED");
  const lines = [];
  for (const [key, value] of Object.entries(env))
    if (allowed.has(key)) {
      if (/[\r\n\0]/.test(value)) throw Error("MULTILINE_WORKER_ENV_REJECTED");
      lines.push(`${key}=${value}`);
    }
  // Diagnose the host's own resolver first; WSL-specific DNS repair is not a cloud default.
  lines.push("PROVIDER_DNS_SERVERS=", `WORKER_PLATFORM=${platform}`);
  return lines.join("\n") + "\n";
}
try {
  if (
    ["host", "release", "activate"].includes(phase) &&
    !args.includes("--host-approved")
  )
    throw Error("HOST_APPROVAL_REQUIRED");
  if (
    platform === "oracle" &&
    ["host", "release", "activate"].includes(phase) &&
    !args.includes("--always-free-confirmed")
  )
    throw Error("ALWAYS_FREE_CONFIRMATION_REQUIRED");
  if (phase === "preflight")
    await ssh(
      "uname -m && nproc && free -m && test -f /etc/os-release && (command -v docker || true) && sudo -n true",
    );
  if (phase === "host") {
    await ssh(
      "sudo env FLOWNIX_HOST_APPROVED=yes bash -s",
      readFileSync("deploy/linux/setup-host.sh"),
    );
  }
  if (["release", "activate"].includes(phase)) {
    const sha = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
    if (
      !/^[a-f0-9]{40}$/.test(sha) ||
      execFileSync("git", ["status", "--porcelain"], {
        encoding: "utf8",
      }).trim()
    )
      throw Error("CLEAN_COMMITTED_RELEASE_REQUIRED");
    const dir = `/opt/flownix/releases/${sha}`,
      image = `flownix-worker:${sha}`;
    if (phase === "release") {
      await ssh(`sudo install -d -m 0755 ${dir}`);
      const archive = spawn("git", ["archive", "--format=tar", sha], {
        stdio: ["ignore", "pipe", "inherit"],
      });
      const remote = spawn("ssh", [...sshArgs, `sudo tar -xf - -C ${dir}`], {
        stdio: ["pipe", "inherit", "inherit"],
      });
      const completed = Promise.all([
        new Promise((resolve, reject) =>
          archive.on("exit", (c) =>
            c === 0 ? resolve() : reject(Error("ARCHIVE_FAILED")),
          ),
        ),
        new Promise((resolve, reject) =>
          remote.on("exit", (c) =>
            c === 0 ? resolve() : reject(Error("UPLOAD_FAILED")),
          ),
        ),
      ]);
      await pipeline(archive.stdout, remote.stdin);
      await completed;
      await ssh(
        "sudo sh -c 'umask 077; cat > /etc/flownix/worker.env.new; chmod 0600 /etc/flownix/worker.env.new; mv /etc/flownix/worker.env.new /etc/flownix/worker.env'",
        workerEnvironment(),
      );
      await ssh(
        `sudo docker build --build-arg FLOWNIX_COMMIT_SHA=${sha} -f ${dir}/Dockerfile.worker -t ${image} ${dir}`,
      );
      await ssh(
        `sudo docker run --rm --env-file /etc/flownix/worker.env ${image} node --import tsx scripts/db-target.ts`,
      );
      await ssh(
        `sudo docker run --rm --env-file /etc/flownix/worker.env ${image} node --import tsx packages/db/src/migrate.ts`,
      );
      await ssh(
        `sudo docker run --rm --env-file /etc/flownix/worker.env --tmpfs /app/artifacts:rw,uid=1000,gid=1000,size=64m ${image} node --import tsx scripts/provider-smoke.ts --persist --rpc`,
      );
      for (const connection of ["pooled", "direct"])
        for (const operation of ["write", "read"])
          await ssh(
            `sudo docker run --rm --env-file /etc/flownix/worker.env ${image} node --import tsx scripts/db-verify.ts ${operation} ${connection} release-${sha}`,
          );
      await ssh(`sudo touch /etc/flownix/verified-${sha}`);
    } else {
      await ssh(
        `sudo docker image inspect ${image} --format '{{.Architecture}}'`,
      );
      await ssh(`sudo test -f /etc/flownix/verified-${sha}`);
      await ssh(
        "sudo sh -c 'umask 077; cat > /etc/flownix/release.env'",
        `FLOWNIX_WORKER_IMAGE=${image}\n`,
      );
      await ssh(
        `sudo install -m 0644 ${dir}/deploy/linux/flownix-worker.service /etc/systemd/system/flownix-worker.service && sudo systemctl daemon-reload && sudo systemctl enable flownix-worker.service && sudo systemctl restart flownix-worker.service`,
      );
    }
  }
  if (phase === "status")
    await ssh(
      "sudo systemctl --no-pager --full status flownix-worker.service; sudo docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' flownix-worker; sudo docker port flownix-worker; sudo journalctl -u flownix-worker.service --no-pager -n 30",
    );
} catch (error) {
  console.error(
    `Worker deployment step failed: ${error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "CHECK_SSH_OR_DEPLOYMENT_LOGS"}. Secrets were not printed by this script.`,
  );
  process.exitCode = 1;
}
