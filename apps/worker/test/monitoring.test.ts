import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  query: vi.fn(),
  intensive: false,
  monitored: false,
  swaps: vi.fn(),
  rpc: {
    head: vi.fn(),
    block: vi.fn(),
    logs: vi.fn(),
    code: vi.fn(),
    decimals: vi.fn(),
    balance: vi.fn(),
  },
}));
vi.mock("@flownix/core", async (original) => {
  const core = await original<typeof import("@flownix/core")>();
  return {
    ...core,
    config: () => ({
      ...core.config(),
      SCAN_BLOCKS: 10,
      SCAN_CONFIRMATIONS: 20,
    }),
    configuredEvmRpc: () => "https://fixture.invalid",
    EvmProvider: class {
      constructor() {
        return fixture.rpc;
      }
    },
  };
});
vi.mock("@flownix/db", () => ({
  sqlClient: () =>
    Object.assign(fixture.query, {
      begin: (fn: (tx: typeof fixture.query) => unknown) => fn(fixture.query),
    }),
  jsonParam: (value: unknown) => value,
  auditRequest: vi.fn(),
  saveSource: vi.fn(),
  setSetting: vi.fn(),
  settingsValue: (_key: string, fallback: unknown) => fallback,
}));
vi.mock("../src/passive-swaps", () => ({ collectPassiveSwaps: fixture.swaps }));
import { scanToken } from "../src/ingest";
import { TRANSFER_TOPIC } from "@flownix/core";

const address = (n: number) => "0x" + n.toString(16).padStart(40, "0");
const hash = (n: number) => "0x" + n.toString(16).padStart(64, "0");
const owner = address(2),
  sender = address(3),
  recipient = address(4);
const observation = <T>(data: T) => ({
  data,
  raw: "{}",
  hash: hash(1),
  source: "fixture-only",
  observedAt: new Date().toISOString(),
  serverDate: null,
});
const writes = (table: string) =>
  fixture.query.mock.calls.filter(([parts]) =>
    parts.join("").includes(`INSERT INTO ${table}`),
  );
beforeEach(() => {
  vi.resetAllMocks();
  fixture.intensive = fixture.monitored = false;
  fixture.query.mockImplementation(async (parts) => {
    const query = parts.join("");
    if (query.includes("FROM alpha_tokens t LEFT JOIN block_cursors"))
      return [
        {
          id: "case-fixture",
          chain_id: "56",
          contract: address(1),
          symbol: "CASE",
          status: "current",
          first_seen: new Date(Date.now() - 86400000).toISOString(),
          last_seen: new Date().toISOString(),
          block_number: 60,
          block_hash: hash(60),
          intensive: fixture.intensive,
          has_monitors: fixture.monitored,
        },
      ];
    if (query.includes("SELECT address FROM wallet_monitoring"))
      return [{ address: owner }];
    return [];
  });
  fixture.rpc.head.mockResolvedValue(100);
  fixture.rpc.block.mockImplementation(async (block: number) =>
    observation({
      number: `0x${block.toString(16)}`,
      hash: hash(block),
      timestamp: `0x${(Math.floor(Date.now() / 1000) - (100 - block) * 3).toString(16)}`,
    }),
  );
  fixture.rpc.logs.mockResolvedValue(
    observation([
      {
        address: address(1),
        topics: [TRANSFER_TOPIC, hash(3), hash(4)],
        data: hash(10),
        blockNumber: "0x46",
        blockHash: hash(70),
        transactionHash: hash(99),
        logIndex: "0x0",
      },
    ]),
  );
  fixture.rpc.code.mockResolvedValue(observation("0x01"));
  fixture.rpc.decimals.mockResolvedValue(18);
  fixture.rpc.balance.mockResolvedValue(observation("1000"));
});

it("records an explicit case monitor at the preserved scan boundary without requiring intensive selection", async () => {
  fixture.monitored = true;
  await scanToken("case-fixture");
  expect(fixture.rpc.balance).toHaveBeenCalledExactlyOnceWith(
    owner,
    address(1),
    70,
  );
  expect(fixture.rpc.logs).toHaveBeenCalledWith(address(1), 61, 70);
  expect(writes("wallet_balance_snapshots")).toHaveLength(1);
  expect(writes("wallet_balance_snapshots")[0]).toEqual(
    expect.arrayContaining([owner, 70, hash(70), "1000"]),
  );
  expect(fixture.swaps).not.toHaveBeenCalled();
});

it("keeps unmonitored baseline scans free of balance and DEX enrichment calls", async () => {
  await scanToken("case-fixture");
  expect(fixture.rpc.balance).not.toHaveBeenCalled();
  expect(writes("wallet_balance_snapshots")).toHaveLength(0);
  expect(fixture.swaps).not.toHaveBeenCalled();
  expect(writes("block_cursors")).toHaveLength(1);
});

it("preserves intensive participant sampling and passive swap collection", async () => {
  fixture.intensive = true;
  await scanToken("case-fixture");
  expect(fixture.rpc.balance.mock.calls.map(([wallet]) => wallet)).toEqual([
    owner,
    sender,
    recipient,
  ]);
  expect(fixture.swaps).toHaveBeenCalledWith(
    expect.objectContaining({ id: "case-fixture" }),
    fixture.rpc,
    61,
    70,
  );
});
