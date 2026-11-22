import postgres from "postgres";
import { connect, type Socket } from "node:net";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import type { Observation, RequestAudit } from "@flownix/core";
import { providerLookup, countMetric } from "@flownix/core";
export * from "./worker-operations";
export type DbRows = postgres.Row[];
let client: ReturnType<typeof postgres> | undefined;
let ormClient: ReturnType<typeof postgres> | undefined;
function createClient(max: number) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  const lookup = providerLookup();
  const parsed = new URL(url);
  const ssl =
    lookup && parsed.searchParams.get("sslmode") === "require"
      ? { rejectUnauthorized: true, servername: parsed.hostname }
      : undefined;
  const options = {
    debug: () => {
      countMetric("postgresQueries");
    },
    max,
    prepare: false,
    connection: { statement_timeout: 30000, application_name: "flownix" },
    connect_timeout: 20,
    idle_timeout: 20,
    transform: { undefined: null },
    ...(ssl ? { ssl } : {}),
    ...(lookup
      ? {
          socket: (config: { host: string[]; port: number[]; ssl: unknown }) =>
            new Promise<Socket>((resolve, reject) => {
              // postgres-js normally rotates through resolved addresses after
              // a failed connection. Its custom-socket hook bypasses that
              // behavior, so explicitly try up to three Neon IPv4 results.
              // Keep TLS verification and the original hostname/SNI intact.
              const candidates = config.host.slice(0, 3);
              let index = 0;
              const tryNext = (lastError?: Error) => {
                if (index >= candidates.length) {
                  reject(lastError ?? Error("DB_CONNECT_FAILED"));
                  return;
                }
                const host = candidates[index];
                const port = config.port[index] ?? config.port[0];
                index++;
                const socket = connect({
                  host,
                  port,
                  lookup,
                  timeout: 5000,
                });
                let settled = false;
                const fail = (error: Error) => {
                  if (settled) return;
                  settled = true;
                  socket.destroy();
                  tryNext(error);
                };
                socket.once("error", fail);
                socket.once("timeout", () =>
                  fail(
                    Object.assign(new Error("DB_CONNECT_TIMEOUT"), {
                      code: "CONNECT_TIMEOUT",
                    }),
                  ),
                );
                socket.once("connect", () => {
                  if (settled) return;
                  settled = true;
                  socket.removeListener("error", fail);
                  socket.setTimeout(0);
                  resolve(
                    Object.assign(socket, {
                      host,
                      port,
                      ssl: config.ssl,
                    }),
                  );
                });
              };
              tryNext();
            }),
        }
      : {}),
  };
  return postgres(url, options);
}
export function sqlClient() {
  if (!client) {
    client = createClient(4);
  }
  return client;
}
// Typed JSON parameters prevent postgres-js from serializing an already stringified value again.
export function jsonParam(value: unknown) {
  return sqlClient().json(
    JSON.parse(JSON.stringify(value)) as postgres.JSONValue,
  );
}
export const database = () => {
  // Drizzle changes postgres-js JSON/date serializers in place. Keep its one-connection
  // audit pool separate so typed raw-SQL JSON parameters retain their native serializer.
  ormClient ??= createClient(1);
  return drizzle(ormClient, { schema });
};
export async function closeDb() {
  if (client) {
    await client.end({ timeout: 3 });
    client = undefined;
  }
  if (ormClient) {
    await ormClient.end({ timeout: 3 });
    ormClient = undefined;
  }
}
export async function auditRequest(a: RequestAudit) {
  // Use the collector's existing SQL pool. Opening a separate ORM connection
  // for each request lane adds connection pressure and cannot improve durability.
  await sqlClient()`INSERT INTO provider_runs(provider,started_at,ok,http_status,error,latency_ms,cost_usd) VALUES(${a.provider},${new Date(a.at)},${a.ok},${a.status},${a.error},${a.latencyMs},'0')`;
}
export async function saveSource<T>(provider: string, o: Observation<T>) {
  await sqlClient()`INSERT INTO source_responses(hash,provider,source,observed_at,server_date,payload,raw_text) VALUES(${o.hash},${provider},${o.source},${o.observedAt},${o.serverDate},${jsonParam(JSON.parse(o.raw))}::jsonb,${o.raw}) ON CONFLICT(hash) DO NOTHING`;
}
export async function settingsValue<T>(key: string, fallback: T): Promise<T> {
  const r = await sqlClient()`SELECT value FROM settings WHERE key=${key}`;
  return r[0] ? (r[0].value as T) : fallback;
}
export async function setSetting(key: string, value: unknown) {
  await sqlClient()`INSERT INTO settings(key,value) VALUES(${key},${jsonParam(value)}::jsonb) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()`;
}
