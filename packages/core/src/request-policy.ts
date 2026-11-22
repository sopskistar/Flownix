import type { RequestAudit } from "./providers";

export type RequestReservation = {
  provider: string;
  alchemyRequests: number;
  alchemyUnits: number;
  unpriced: number;
};
export type RequestPolicy = {
  reserve: (request: RequestReservation) => Promise<void>;
  complete: (audit: RequestAudit) => Promise<void>;
};
let policy: RequestPolicy | undefined;
/** The worker installs durable guards; no credentials or request bodies enter the ledger. */
export function installRequestPolicy(value: RequestPolicy | undefined) {
  policy = value;
}
export function requestPolicy() {
  return policy;
}
