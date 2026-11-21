import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  query: vi.fn(),
  rpc: {
    version: vi.fn(),
    slot: vi.fn(),
    mintInfo: vi.fn(),
    largestTokenAccounts: vi.fn(),
    tokenAccountOwner: vi.fn(),
    signatures: vi.fn(),
    transaction: vi.fn(),
  },
}));
vi.mock("@flownix/core", async (original) => {
  const core = await original<typeof import("@flownix/core")>();
  return {
    ...core,
    config: () => ({
      ...core.config(),
      SOLANA_HISTORY_SIGNATURES_PER_ACCOUNT: 2,
    }),
    SolanaProvider: class {
      constructor() {
        return fixture.rpc;
      }
    },
  };
});
vi.mock("@flownix/db", () => ({
  sqlClient: () => fixture.query,
  jsonParam: (value: unknown) => value,
  saveSource: vi.fn(),
  auditRequest: vi.fn(),
}));
import { scanSolanaToken } from "../src/solana";

const token = {
  id: "fixture-only",
  chain_id: "CT_501",
  contract: "11111111111111111111111111111111",
  last_seen: new Date().toISOString(),
};
const observation = <T>(data: T) => ({
  data,
  observedAt: new Date().toISOString(),
  source: "fixture-only",
  hash: "fixture-only",
  raw: "{}",
});
const signature = (value: string, slot = 12) => ({
  signature: value,
  slot,
  err: null,
});
const validTransaction = (slot: number) =>
  observation({
    slot,
    blockTime: 1,
    meta: { err: null, preTokenBalances: [], postTokenBalances: [] },
    transaction: { message: { accountKeys: [] } },
  });
const cursorWrites = () =>
  fixture.query.mock.calls.filter(([parts]) =>
    parts.join("").includes("INSERT INTO solana_account_cursors"),
  );

beforeEach(() => {
  vi.resetAllMocks();
  fixture.query.mockResolvedValue([]);
  fixture.rpc.version.mockResolvedValue(
    observation({ "solana-core": "fixture" }),
  );
  fixture.rpc.slot.mockResolvedValue(observation(20));
  fixture.rpc.mintInfo.mockResolvedValue(
    observation({ tokenProgram: "fixture", decimals: 6 }),
  );
  fixture.rpc.largestTokenAccounts.mockResolvedValue(
    observation({
      context: { slot: 20 },
      value: [{ address: "account-a", amount: "1", decimals: 6 }],
    }),
  );
  fixture.rpc.tokenAccountOwner.mockResolvedValue(
    observation({ owner: "owner", mint: token.contract }),
  );
  fixture.rpc.signatures.mockResolvedValue(observation([signature("newest")]));
  fixture.rpc.transaction.mockResolvedValue(validTransaction(12));
});

describe("Solana sampled-account evidence", () => {
  it("processes oldest first but checkpoints the newest signature without mutating the source", async () => {
    const signatures = [signature("newest", 12), signature("older", 11)];
    fixture.rpc.signatures.mockResolvedValue(observation(signatures));
    fixture.rpc.transaction.mockImplementation(async (value) =>
      validTransaction(value === "older" ? 11 : 12),
    );
    const result = await scanSolanaToken(token);
    expect(fixture.rpc.transaction.mock.calls.map(([value]) => value)).toEqual([
      "older",
      "newest",
    ]);
    expect(signatures.map((value) => value.signature)).toEqual([
      "newest",
      "older",
    ]);
    expect(cursorWrites()[0][3]).toBe("newest");
    expect(result).toMatchObject({ gapAccounts: 1, completeHistory: false });
  });

  it("keeps availability gaps local to an account and preserves a previously continuous peer", async () => {
    fixture.rpc.largestTokenAccounts.mockResolvedValue(
      observation({
        context: { slot: 20 },
        value: ["account-a", "account-b"].map((address) => ({
          address,
          amount: "1",
          decimals: 6,
        })),
      }),
    );
    fixture.query.mockImplementation(async (parts, ...values) =>
      parts.join("").includes("SELECT last_signature") &&
      values[1] === "account-b"
        ? [{ last_signature: "newest", coverage_gap: false }]
        : [],
    );
    fixture.rpc.transaction.mockResolvedValue(observation(null));
    const result = await scanSolanaToken(token);
    expect(result).toMatchObject({
      gapAccounts: 1,
      unavailableTransactions: 1,
      transactions: 0,
    });
    expect(cursorWrites().map((values) => values[2])).toEqual(["account-b"]);
    expect(cursorWrites()[0][6]).toBe(false);
  });

  it("fetches a shared transaction once rather than inflating transaction counts across holders", async () => {
    fixture.rpc.largestTokenAccounts.mockResolvedValue(
      observation({
        context: { slot: 20 },
        value: ["account-a", "account-b"].map((address) => ({
          address,
          amount: "1",
          decimals: 6,
        })),
      }),
    );
    const result = await scanSolanaToken(token);
    expect(fixture.rpc.transaction).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      transactions: 1,
      unavailableTransactions: 0,
      gapAccounts: 0,
      completeHistory: false,
    });
  });

  it("does not count mismatched-slot transaction metadata as verified evidence", async () => {
    fixture.rpc.transaction.mockResolvedValue(validTransaction(999));
    const result = await scanSolanaToken(token);
    expect(result).toMatchObject({
      transactions: 0,
      gapAccounts: 1,
      unavailableTransactions: 1,
    });
    expect(cursorWrites()).toHaveLength(0);
  });

  it("retains an existing checkpoint when transaction metadata is temporarily unavailable", async () => {
    fixture.query.mockImplementation(async (parts) =>
      parts.join("").includes("SELECT last_signature")
        ? [{ last_signature: "prior", coverage_gap: false }]
        : [],
    );
    fixture.rpc.transaction.mockResolvedValue(observation(null));
    await scanSolanaToken(token);
    expect(cursorWrites()).toHaveLength(0);
    const updates = fixture.query.mock.calls.filter(([parts]) =>
      parts
        .join("")
        .includes("UPDATE solana_account_cursors SET coverage_gap=true"),
    );
    expect(updates).toHaveLength(1);
  });
});
