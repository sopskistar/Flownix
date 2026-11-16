import { z } from "zod";
import { HttpClient, ProviderError } from "./providers";
import { isEvmAddress } from "./identity";
export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const hex = z.string().regex(/^0x[0-9a-fA-F]+$/);
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
export const logSchema = z.object({
  address: z.string(),
  topics: z.array(hash),
  data: hex,
  blockNumber: hex,
  blockHash: hash,
  transactionHash: hash,
  logIndex: hex,
  removed: z.boolean().optional(),
});
export type Transfer = {
  chain: string;
  tokenId: string;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  blockHash: string;
  eventTime: string;
  from: string;
  to: string;
  rawQuantity: string;
  decimals: number;
  kind: "unknown_transfer" | "mint" | "burn" | "self_transfer";
  source: string;
  availableAt: string;
};
const zero = "0x0000000000000000000000000000000000000000";
export function decodeTransfer(
  input: unknown,
  chain: string,
  tokenId: string,
  decimals: number,
  eventTime: string,
  source: string,
  availableAt: string,
): Transfer | null {
  const l = logSchema.parse(input);
  if (
    l.removed ||
    l.topics.length !== 3 ||
    l.topics[0].toLowerCase() !== TRANSFER_TOPIC ||
    !/^0x[0-9a-fA-F]{64}$/.test(l.data)
  )
    return null;
  const from = ("0x" + l.topics[1].slice(-40)).toLowerCase();
  const to = ("0x" + l.topics[2].slice(-40)).toLowerCase();
  return {
    chain,
    tokenId,
    txHash: l.transactionHash.toLowerCase(),
    logIndex: parseInt(l.logIndex, 16),
    blockNumber: parseInt(l.blockNumber, 16),
    blockHash: l.blockHash.toLowerCase(),
    eventTime,
    from,
    to,
    rawQuantity: BigInt(l.data).toString(),
    decimals,
    kind:
      from === to
        ? "self_transfer"
        : from === zero
          ? "mint"
          : to === zero
            ? "burn"
            : "unknown_transfer",
    source,
    availableAt,
  };
}
export function tokenUnits(raw: string, decimals: number) {
  if (
    !/^[0-9]+$/.test(raw) ||
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 255
  )
    throw Error("Invalid atomic amount");
  const s = BigInt(raw)
    .toString()
    .padStart(decimals + 1, "0");
  if (!decimals) return s;
  const f = s.slice(-decimals).replace(/0+$/, "");
  return s.slice(0, -decimals) + (f ? "." + f : "");
}
export class EvmProvider {
  constructor(
    public chain: string,
    private url: string,
    private http: HttpClient,
  ) {
    if (!/^https?:$/.test(new URL(url).protocol))
      throw Error("Invalid configured RPC");
  }
  async rpc<T>(method: string, params: unknown[], schema: z.ZodType<T>) {
    const r = await this.http.json(
      this.url,
      (body) => {
        const b = z
          .object({
            error: z
              .object({ code: z.number(), message: z.string() })
              .optional(),
            result: z.unknown().optional(),
          })
          .parse(body);
        if (b.error) throw new ProviderError(`RPC_${b.error.code}`);
        return schema.parse(b.result);
      },
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      },
    );
    return { ...r, source: `configured_rpc:${this.chain}` };
  }
  async head() {
    const actual = await this.rpc("eth_chainId", [], hex);
    if (BigInt(actual.data) !== BigInt(this.chain))
      throw new ProviderError("CHAIN_ID_MISMATCH");
    const r = await this.rpc("eth_blockNumber", [], hex);
    return parseInt(r.data, 16);
  }
  async block(n: number) {
    return this.rpc(
      "eth_getBlockByNumber",
      ["0x" + n.toString(16), false],
      z.object({ hash, timestamp: hex, number: hex }),
    );
  }
  async decimals(address: string) {
    const r = await this.rpc(
      "eth_call",
      [{ to: address, data: "0x313ce567" }, "latest"],
      hex,
    );
    const d = Number(BigInt(r.data));
    if (d < 0 || d > 255) throw new ProviderError("DECIMALS_OUT_OF_RANGE");
    return d;
  }
  logs(address: string, from: number, to: number) {
    if (!isEvmAddress(address) || to < from || to - from > 1000)
      throw new ProviderError("INVALID_LOG_RANGE");
    return this.rpc(
      "eth_getLogs",
      [
        {
          address,
          fromBlock: "0x" + from.toString(16),
          toBlock: "0x" + to.toString(16),
          topics: [TRANSFER_TOPIC],
        },
      ],
      z.array(logSchema),
    );
  }
  async balance(address: string, contract: string, block: number) {
    if (!isEvmAddress(address) || !isEvmAddress(contract))
      throw new ProviderError("INVALID_ADDRESS");
    const r = await this.rpc(
      "eth_call",
      [
        {
          to: contract,
          data: "0x70a08231" + address.slice(2).toLowerCase().padStart(64, "0"),
        },
        "0x" + block.toString(16),
      ],
      hex,
    );
    return { ...r, data: BigInt(r.data).toString() };
  }
}
