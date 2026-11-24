import { it, expect } from "vitest";
import { envSchema } from "../src/config";
import {
  validateWorkerLaunchEnvironment,
  validateWorkerDatabaseTarget,
} from "../src/worker-readiness";
const env = {
  DATABASE_URL:
    "postgresql://fixture:fixture@ep-test-pooler.neon.tech/fixture?sslmode=require",
  DATABASE_URL_WORKER:
    "postgresql://fixture:fixture@ep-test.neon.tech/fixture?sslmode=require",
  BSC_RPC_URL: "https://example.com/bsc",
  ETH_RPC_URL: "https://example.com/eth",
  BASE_RPC_URL: "https://example.com/base",
  ARBITRUM_RPC_URL: "https://example.com/arbitrum",
  SOLANA_RPC_URL: "https://example.com/solana",
  ALCHEMY_MONTHLY_UNTRACKED_CU: "0",
};
it("requires consistent database targets and TLS before external gate reads", () => {
  expect(() =>
    validateWorkerLaunchEnvironment(envSchema.parse(env), env),
  ).not.toThrow();
  expect(() =>
    validateWorkerDatabaseTarget(
      envSchema.parse({ ...env, DATABASE_URL_WORKER: env.DATABASE_URL }),
    ),
  ).toThrow("TARGET_MISMATCH");
  expect(() =>
    validateWorkerDatabaseTarget(
      envSchema.parse({
        ...env,
        DATABASE_URL: env.DATABASE_URL.replace("?sslmode=require", ""),
      }),
      true,
    ),
  ).toThrow("TLS_REQUIRED");
});
it("blocks missing reconciliation, paid enrichment and diagnostic filters before allocation", () => {
  expect(() =>
    validateWorkerLaunchEnvironment(envSchema.parse(env), {
      ...env,
      ALCHEMY_MONTHLY_UNTRACKED_CU: undefined,
    }),
  ).toThrow("RECONCILIATION");
  expect(() =>
    validateWorkerLaunchEnvironment(
      envSchema.parse({ ...env, PAID_ENRICHMENT_ENABLED: "true" }),
      env,
    ),
  ).toThrow("PAID_ENRICHMENT");
  expect(() =>
    validateWorkerLaunchEnvironment(envSchema.parse(env), {
      ...env,
      WORKER_JOB_KINDS: "scan",
    }),
  ).toThrow("DIAGNOSTIC");
  expect(() =>
    validateWorkerLaunchEnvironment(
      envSchema.parse({ ...env, ETH_RPC_URL: "http://example.com" }),
      env,
    ),
  ).toThrow("HTTPS");
});
it("permits local read-only inspection but never an unencrypted local launch", () => {
  const c = envSchema.parse({
    ...env,
    DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1/fixture",
    DATABASE_URL_WORKER: "postgresql://fixture:fixture@127.0.0.1/fixture",
  });
  expect(() => validateWorkerDatabaseTarget(c, true)).not.toThrow();
  expect(() => validateWorkerLaunchEnvironment(c, env)).toThrow("TLS_REQUIRED");
});
