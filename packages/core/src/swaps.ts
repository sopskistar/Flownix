import { keccak_256 } from "@noble/hashes/sha3.js";
import {
  type logSchema,
  type EvmProvider,
  TRANSFER_TOPIC,
  type Transfer,
} from "./evm";
import { isEvmAddress } from "./identity";
import type { z } from "zod";
import type { Observation } from "./providers";

export const signatureHash = (signature: string) =>
  "0x" +
  Buffer.from(keccak_256(new TextEncoder().encode(signature))).toString("hex");
export const functionSelector = (signature: string) =>
  signatureHash(signature).slice(0, 10);
// Pancake V3 has two additional protocol-fee fields; it is not Uniswap V3's event.
export const PANCAKE_V3_SWAP = signatureHash(
  "Swap(address,address,int256,int256,uint160,uint128,int24,uint128,uint128)",
);
export const pancakeV3Factory = "0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865";
export const pancakeFactorySource =
  "https://developer.pancakeswap.finance/contracts/v3/addresses";
export type EvmLog = z.infer<typeof logSchema>;
export type PoolIdentity = {
  chain: string;
  address: string;
  factory: string;
  token0: string;
  token1: string;
  fee: number;
  verifiedBlock: number;
  proofHashes: string[];
};
export type PassiveSwap = {
  eventId: string;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  blockHash: string;
  pool: string;
  target: string;
  quote: string;
  side: "buy" | "sell";
  rawQuantity: string;
  rawQuote: string;
  actor: string | null;
  classification:
    | "verified_swap_buy"
    | "verified_swap_sell"
    | "verified_pool_swap_unattributed";
  settlementLogIndices: number[];
  caveats: string[];
};
export const abiWord = (value: bigint) => value.toString(16).padStart(64, "0");
const addressWord = (address: string) => {
  if (!isEvmAddress(address)) throw Error("INVALID_ABI_ADDRESS");
  return address.slice(2).toLowerCase().padStart(64, "0");
};
export function decodeAddressWord(data: string) {
  if (!/^0x0{24}[a-fA-F0-9]{40}$/.test(data))
    throw Error("INVALID_ABI_ADDRESS_WORD");
  return "0x" + data.slice(-40).toLowerCase();
}
export async function verifyPancakePool(
  rpc: EvmProvider,
  address: string,
  target: string,
  block: number,
): Promise<PoolIdentity & { responses: Observation<string>[] }> {
  if (
    !["56", "1", "8453"].includes(rpc.chain) ||
    !isEvmAddress(address) ||
    !isEvmAddress(target)
  )
    throw Error("UNSUPPORTED_POOL");
  const [factory, token0, token1, fee] = await Promise.all([
    rpc.callWord(address, functionSelector("factory()"), block),
    rpc.callWord(address, functionSelector("token0()"), block),
    rpc.callWord(address, functionSelector("token1()"), block),
    rpc.callWord(address, functionSelector("fee()"), block),
  ]);
  const f = decodeAddressWord(factory.data),
    a = decodeAddressWord(token0.data),
    b = decodeAddressWord(token1.data),
    tier = Number(BigInt(fee.data));
  if (
    f !== pancakeV3Factory ||
    ![a, b].includes(target.toLowerCase()) ||
    tier < 0 ||
    tier > 0xffffff ||
    a === b
  )
    throw Error("UNVERIFIED_POOL_IDENTITY");
  const registered = await rpc.callWord(
    f,
    functionSelector("getPool(address,address,uint24)") +
      addressWord(a) +
      addressWord(b) +
      abiWord(BigInt(tier)),
    block,
  );
  if (decodeAddressWord(registered.data) !== address.toLowerCase())
    throw Error("POOL_NOT_REGISTERED_BY_FACTORY");
  return {
    chain: rpc.chain,
    address: address.toLowerCase(),
    factory: f,
    token0: a,
    token1: b,
    fee: tier,
    verifiedBlock: block,
    proofHashes: [
      factory.hash,
      token0.hash,
      token1.hash,
      fee.hash,
      registered.hash,
    ],
    responses: [factory, token0, token1, fee, registered],
  };
}
function signed(word: string) {
  const value = BigInt("0x" + word);
  return value >= 1n << 255n ? value - (1n << 256n) : value;
}
export function interpretPancakeSwap(
  pool: PoolIdentity,
  target: string,
  event: EvmLog,
  receipt: {
    from: string;
    transactionHash: string;
    blockHash: string;
    status: string;
    logs: EvmLog[];
  },
): PassiveSwap | null {
  target = target.toLowerCase();
  if (
    pool.factory !== pancakeV3Factory ||
    ![pool.token0, pool.token1].includes(target) ||
    event.removed ||
    event.address.toLowerCase() !== pool.address ||
    event.topics.length !== 3 ||
    event.topics[0].toLowerCase() !== PANCAKE_V3_SWAP ||
    !/^0x[0-9a-fA-F]{448}$/.test(event.data)
  )
    return null;
  if (
    receipt.transactionHash.toLowerCase() !==
      event.transactionHash.toLowerCase() ||
    receipt.blockHash.toLowerCase() !== event.blockHash.toLowerCase() ||
    BigInt(receipt.status) !== 1n
  )
    return null;
  const inReceipt = receipt.logs.find(
    (log) =>
      log.address.toLowerCase() === pool.address &&
      log.logIndex === event.logIndex &&
      log.data === event.data &&
      log.topics.join(":").toLowerCase() ===
        event.topics.join(":").toLowerCase(),
  );
  if (!inReceipt) return null;
  const words = event.data.slice(2).match(/.{64}/g)!;
  const zero = signed(words[0]),
    one = signed(words[1]);
  if (zero === 0n || one === 0n || zero > 0n === one > 0n) return null;
  const amount = target === pool.token0 ? zero : one,
    quoteAmount = target === pool.token0 ? one : zero;
  const side = amount < 0n ? "buy" : "sell",
    quantity = amount < 0n ? -amount : amount;
  const sender = receipt.from.toLowerCase();
  const settlement = receipt.logs
    .filter(
      (log) =>
        !log.removed &&
        log.address.toLowerCase() === target &&
        log.topics.length === 3 &&
        log.topics[0].toLowerCase() === TRANSFER_TOPIC &&
        /^0x[0-9a-fA-F]{64}$/.test(log.data),
    )
    .filter((log) => {
      const from = "0x" + log.topics[1].slice(-40).toLowerCase(),
        to = "0x" + log.topics[2].slice(-40).toLowerCase();
      return side === "buy"
        ? from === pool.address && to === sender
        : from === sender && to === pool.address;
    });
  const settled = settlement.reduce((sum, log) => sum + BigInt(log.data), 0n);
  // Multiple relevant swaps in the same pool/receipt make ownership attribution ambiguous.
  const poolSwaps = receipt.logs.filter(
    (log) =>
      log.address.toLowerCase() === pool.address &&
      log.topics[0]?.toLowerCase() === PANCAKE_V3_SWAP,
  );
  const actor = settled === quantity && poolSwaps.length === 1 ? sender : null;
  return {
    eventId: `${event.transactionHash.toLowerCase()}:${Number(BigInt(event.logIndex))}`,
    txHash: event.transactionHash.toLowerCase(),
    logIndex: Number(BigInt(event.logIndex)),
    blockNumber: Number(BigInt(event.blockNumber)),
    blockHash: event.blockHash.toLowerCase(),
    pool: pool.address,
    target,
    quote: target === pool.token0 ? pool.token1 : pool.token0,
    side,
    rawQuantity: quantity.toString(),
    rawQuote: (quoteAmount < 0n ? -quoteAmount : quoteAmount).toString(),
    actor,
    classification: actor
      ? side === "buy"
        ? "verified_swap_buy"
        : "verified_swap_sell"
      : "verified_pool_swap_unattributed",
    settlementLogIndices: settlement.map((log) => Number(BigInt(log.logIndex))),
    caveats: [
      "Observed pool swap and direct token settlement only; no beneficial-owner identity or wallet independence established",
      ...(actor
        ? []
        : [
            "Router, multi-hop, fee-token or other settlement ambiguity: no accumulator address assigned",
          ]),
    ],
  };
}

export function purchaseRetentionLowerBound(
  buys: { eventId: string; rawQuantity: string; at: string }[],
  transfers: Transfer[],
  address: string,
  closingBalance: string | null,
  completeLedger: boolean,
) {
  const unique = [
    ...new Map(buys.map((b) => [b.eventId, b])).values(),
  ].toSorted((a, b) => a.at.localeCompare(b.at));
  if (!completeLedger || closingBalance === null || !unique.length)
    return {
      retainedRaw: null,
      retentionPct: null,
      method:
        "unavailable: continuous transfer ledger and closing balance required",
    };
  const purchased = unique.reduce((s, b) => s + BigInt(b.rawQuantity), 0n);
  const outs = [
    ...new Map(
      transfers.map((t) => [`${t.chain}:${t.txHash}:${t.logIndex}`, t]),
    ).values(),
  ]
    .filter(
      (t) =>
        t.from === address && t.to !== address && t.eventTime >= unique[0].at,
    )
    .reduce((s, t) => s + BigInt(t.rawQuantity), 0n);
  const remainder = purchased > outs ? purchased - outs : 0n,
    balance = BigInt(closingBalance),
    retained = remainder < balance ? remainder : balance;
  return {
    retainedRaw: retained.toString(),
    retentionPct:
      purchased > 0n ? Number((retained * 10000n) / purchased) / 100 : null,
    method:
      "Conservative lower bound: all subsequent outgoing tokens consume purchase lots first; ordinary incoming transfers do not count as buys",
  };
}
