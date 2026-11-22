import {
  config,
  ProviderError,
  type RequestPolicy,
  type RequestReservation,
} from "@flownix/core";
import { sqlClient } from "./index";

export function budgetPeriods(at = new Date()) {
  const day = new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
  );
  const month = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
  return {
    day,
    month,
    tomorrow: new Date(+day + 86400000),
    nextMonth: new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1)),
  };
}

/** Reserve BEFORE dispatch. Failed/uncertain requests are never refunded. */
export async function reserveWorkerRequest(
  request: RequestReservation,
  client = sqlClient(),
  at = new Date(),
) {
  const c = config(),
    p = budgetPeriods(at);
  const state =
    await client`SELECT blocked_until,reason FROM worker_provider_state WHERE provider=${request.provider} AND reason IS NOT NULL AND blocked_until>now()`;
  if (state[0])
    throw new ProviderError(
      "PROVIDER_DEFERRED",
      null,
      undefined,
      new Date(state[0].blocked_until),
    );
  if (request.unpriced)
    throw new ProviderError(
      "ALCHEMY_UNPRICED_METHOD",
      null,
      undefined,
      p.tomorrow,
    );
  const scopes = [
    {
      scope: `requests:${request.provider}`,
      start: p.day,
      end: p.tomorrow,
      amount: 1,
      limit:
        request.provider === "binance_alpha"
          ? c.ALPHA_DAILY_REQUEST_LIMIT
          : c.RPC_DAILY_REQUEST_LIMIT,
    },
  ];
  if (request.alchemyRequests)
    scopes.push(
      {
        scope: "alchemy:day",
        start: p.day,
        end: p.tomorrow,
        amount: request.alchemyUnits,
        limit: c.ALCHEMY_DAILY_CU_LIMIT,
      },
      {
        scope: "alchemy:month",
        start: p.month,
        end: p.nextMonth,
        amount: request.alchemyUnits,
        limit: Math.max(
          0,
          c.ALCHEMY_MONTHLY_CU_LIMIT - c.ALCHEMY_MONTHLY_UNTRACKED_CU,
        ),
      },
    );
  try {
    await client.begin(async (tx) => {
      for (const s of scopes) {
        const reserved =
          await tx`INSERT INTO worker_budget_usage(scope,period_start,used)
          SELECT ${s.scope},${s.start},${s.amount}::bigint WHERE ${s.amount}::bigint<=${s.limit}::bigint
          ON CONFLICT(scope,period_start) DO UPDATE SET used=worker_budget_usage.used+excluded.used,updated_at=now()
          WHERE worker_budget_usage.used+excluded.used<=${s.limit} RETURNING used`;
        if (!reserved.length)
          throw new ProviderError(
            "PROVIDER_BUDGET_EXHAUSTED",
            null,
            undefined,
            s.end,
          );
      }
    });
  } catch (error) {
    if (error instanceof ProviderError && error.retryAt) {
      await client`INSERT INTO worker_provider_state(provider,blocked_until,reason) VALUES(${request.provider},${error.retryAt},${error.code}) ON CONFLICT(provider) DO UPDATE SET blocked_until=greatest(worker_provider_state.blocked_until,excluded.blocked_until),reason=excluded.reason,updated_at=now()`;
    }
    throw error;
  }
}

export function workerRequestPolicy(client = sqlClient()): RequestPolicy {
  return {
    reserve: (request) => reserveWorkerRequest(request, client),
    complete: async (a) => {
      if (a.error === "COLLECTION_STOPPED") return;
      // Method/identity errors are token-specific; do not pause an entire chain.
      const infrastructureFailure =
        !a.ok &&
        (a.status === null ||
          a.status === 403 ||
          a.status === 429 ||
          (a.status ?? 0) >= 500);
      if (!a.ok && !infrastructureFailure) return;
      const delay = a.ok
        ? 0
        : a.status === 403
          ? 3600
          : a.status === 429
            ? Math.max(60, a.retryAfterSeconds ?? 60)
            : 120;
      await client`INSERT INTO worker_provider_state(provider,failures,blocked_until,reason)
        VALUES(${a.provider},${a.ok ? 0 : 1},now()+(${!a.ok && (a.status === 403 || a.status === 429) ? delay : 0}*interval '1 second'),${a.error})
        ON CONFLICT(provider) DO UPDATE SET
          failures=CASE WHEN ${a.ok} THEN 0 ELSE worker_provider_state.failures+1 END,
          blocked_until=CASE WHEN worker_provider_state.blocked_until>now() THEN worker_provider_state.blocked_until WHEN ${a.ok} THEN now() WHEN ${a.status === 403 || a.status === 429} OR worker_provider_state.failures>=2 THEN now()+(${delay}*interval '1 second') ELSE now() END,
          reason=CASE WHEN worker_provider_state.blocked_until>now() THEN worker_provider_state.reason ELSE excluded.reason END,updated_at=now()`;
    },
  };
}
