import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import type { Observation, RequestAudit } from "@flownix/core";
export type DbRows = postgres.Row[];
let client: ReturnType<typeof postgres> | undefined;
export function sqlClient() {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not configured");
    client = postgres(url, {
      max: 4,
      prepare: false,
      connect_timeout: 5,
      idle_timeout: 20,
      transform: { undefined: null },
    });
  }
  return client;
}
// Typed JSON parameters prevent postgres-js from serializing an already stringified value again.
export function jsonParam(value: unknown) {
  return sqlClient().json(
    JSON.parse(JSON.stringify(value)) as postgres.JSONValue,
  );
}
export const database = () => drizzle(sqlClient(), { schema });
export async function closeDb() {
  if (client) {
    await client.end({ timeout: 3 });
    client = undefined;
  }
}
export async function auditRequest(a: RequestAudit) {
  await database()
    .insert(schema.providerRuns)
    .values({
      provider: a.provider,
      startedAt: new Date(a.at),
      ok: a.ok,
      httpStatus: a.status,
      error: a.error,
      latencyMs: a.latencyMs,
      costUsd: "0",
    });
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
