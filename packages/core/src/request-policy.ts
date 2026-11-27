import type { RequestAudit } from "./providers";
import { AsyncLocalStorage } from "node:async_hooks";
export type RequestWorkload = "enrichment" | "historical";
const workload = new AsyncLocalStorage<RequestWorkload>();
export const requestWorkload = () => workload.getStore();
export const withRequestWorkload = <T>(
  kind: RequestWorkload,
  run: () => T,
): T => workload.run(kind, run);

export type RequestReservation = {
  provider: string;
  alchemyRequests: number;
  alchemyUnits: number;
  unpriced: number;
  workload?: RequestWorkload;
};
export type RequestPolicy = {
  reserve: (request: RequestReservation) => Promise<void>;
  complete: (audit: RequestAudit) => Promise<void>;
};
let policy: RequestPolicy | undefined;
const scopedPolicy = new AsyncLocalStorage<RequestPolicy>();
export const withRequestPolicy = <T>(value: RequestPolicy, run: () => T): T =>
  scopedPolicy.run(value, run);
/** The worker installs durable guards; no credentials or request bodies enter the ledger. */
export function installRequestPolicy(value: RequestPolicy | undefined) {
  policy = value;
}
export function requestPolicy() {
  return scopedPolicy.getStore() ?? policy;
}
