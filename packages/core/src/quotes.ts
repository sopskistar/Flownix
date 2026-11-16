import Decimal from "decimal.js";
import { z } from "zod";
const positive = z
  .string()
  .regex(/^\d+(\.\d+)?$/)
  .refine((v) => new Decimal(v).gt(0));
export const depthSchema = z
  .object({
    symbol: z.string(),
    bids: z.array(z.tuple([positive, positive])).min(1),
    asks: z.array(z.tuple([positive, positive])).min(1),
    E: z.coerce.number().optional(),
    T: z.coerce.number().optional(),
  })
  .passthrough();
export type BookQuote = {
  bid: string;
  bidQuantity: string;
  ask: string;
  askQuantity: string;
  observedAt: string;
  providerTime: string;
  source: string;
  hash: string;
};
export function bookQuote(
  data: z.infer<typeof depthSchema>,
  observedAt: string,
  source: string,
  hash: string,
): BookQuote | null {
  if (
    !data.E ||
    Date.parse(observedAt) - data.E > 900000 ||
    data.E - Date.parse(observedAt) > 30000
  )
    return null;
  const bid = data.bids.toSorted((a, b) => new Decimal(b[0]).cmp(a[0]))[0],
    ask = data.asks.toSorted((a, b) => new Decimal(a[0]).cmp(b[0]))[0];
  if (new Decimal(bid[0]).gte(ask[0])) return null;
  return {
    bid: bid[0],
    bidQuantity: bid[1],
    ask: ask[0],
    askQuantity: ask[1],
    observedAt,
    providerTime: new Date(data.E).toISOString(),
    source,
    hash,
  };
}
export function quoteUsable(
  q: BookQuote | null | undefined,
  at: string,
  maxSeconds = 900,
) {
  return (
    !!q &&
    Date.parse(q.observedAt) <= Date.parse(at) &&
    Date.parse(at) - Date.parse(q.observedAt) <= maxSeconds * 1000 &&
    Date.parse(q.observedAt) - Date.parse(q.providerTime) <=
      maxSeconds * 1000 &&
    Date.parse(q.providerTime) - Date.parse(q.observedAt) <= 30000 &&
    new Decimal(q.bid).gt(0) &&
    new Decimal(q.ask).gte(q.bid)
  );
}
