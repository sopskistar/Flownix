import { describe, it, expect } from "vitest";
import {
  preferredAlphaPair,
  freshness,
  HttpClient,
  tickerSchema,
} from "../src/index";
import { transferInvestigationCandidate } from "../src/investigation";
import { formatResearchNotification } from "../src/notification-format";
import { evaluateAccumulationThesis } from "../src/thesis";

describe("market identity and research safety", () => {
  it("rejects missing, zero and nonnumeric official prices rather than manufacturing zero", () => {
    const valid = {
      symbol: "ALPHA_409USDT",
      lastPrice: "2.32",
      priceChangePercent: "-10",
      volume: "100",
      quoteVolume: "232",
      closeTime: 1795720829220,
    };
    expect(tickerSchema.safeParse(valid).success).toBe(true);
    for (const lastPrice of [null, "", "0", "NaN", "-2"])
      expect(tickerSchema.safeParse({ ...valid, lastPrice }).success).toBe(
        false,
      );
  });
  it("selects EVAA exact Alpha ID and USDT, rejecting ticker collision and delisted markets", () => {
    expect(
      preferredAlphaPair("ALPHA_409", [
        {
          symbol: "EVAAUSDT",
          baseAsset: "EVAA",
          quoteAsset: "USDT",
          status: "TRADING",
        },
        {
          symbol: "ALPHA_409U",
          baseAsset: "ALPHA_409",
          quoteAsset: "U",
          status: "DELISTED",
        },
        {
          symbol: "ALPHA_409USDC",
          baseAsset: "ALPHA_409",
          quoteAsset: "USDC",
          status: "TRADING",
        },
        {
          symbol: "ALPHA_409USDT",
          baseAsset: "ALPHA_409",
          quoteAsset: "USDT",
          status: "TRADING",
        },
      ])?.symbol,
    ).toBe("ALPHA_409USDT");
    expect(preferredAlphaPair(null, [])).toBeNull();
  });
  it("distinguishes missing, stale, recent and future provider observations", () => {
    const now = Date.parse("2026-11-26T19:00:00Z");
    expect(freshness(null, now)).toBe("unavailable");
    expect(freshness("2026-11-26T15:55:31.939Z", now)).toBe("stale");
    expect(freshness("2026-11-26T18:59:00Z", now)).toBe("current");
    expect(freshness("2026-11-27T18:59:00Z", now)).toBe("stale");
  });
  it("can select incomplete research without a market freshness dependency, never without a baseline", () => {
    expect(
      transferInvestigationCandidate(
        30,
        Array.from({ length: 6 }, () => ({ count: 3, complete: true })),
      ),
    ).toBe(true);
    expect(
      transferInvestigationCandidate(30, [{ count: 3, complete: true }]),
    ).toBe(false);
    expect(
      transferInvestigationCandidate(
        30,
        Array.from({ length: 6 }, () => ({ count: 3, complete: false })),
      ),
    ).toBe(false);
  });
  it("records specific suppression reasons without relaxing validation", () => {
    const s = evaluateAccumulationThesis(
      "DISCOVERY",
      {
        observedDays: 0,
        buyDays: 0,
        retainingAddresses: 0,
        retentionPct: null,
        coverage: 0,
        marketFresh: false,
        membershipCurrent: false,
        priceChangePct: null,
        verifiedDistribution: false,
        distributionEvidenceIds: [],
        independenceVerified: false,
        txIds: [],
        availableAt: "2026-11-26T19:00:00Z",
      },
      "2026-11-26T19:00:00Z",
    );
    expect(s.state).toBe("INSUFFICIENT EVIDENCE");
    expect(s.suppressionReasons).toContain(
      "Fewer than three days of verified attributed purchases",
    );
    expect(s.suppressionReasons).toContain(
      "Joint transfer and pool history coverage below threshold",
    );
  });
  it("formats incomplete research distinctly and retains separate event/local times and evidence links", () => {
    const text = formatResearchNotification(
      {
        symbol: "EVAA",
        chain_id: "56",
        contract: "0xabc",
        token_id: "a".repeat(32),
        evidence_confidence: "limited",
        kind: "TRANSFER_ACTIVITY",
        message: "Observed transfers",
        observed: { complete: false },
        counter_evidence: ["Partial history"],
        first_detected_at: "2026-11-26T16:00:00Z",
        data_available_at: "2026-11-26T16:00:00Z",
      },
      [
        {
          eventTime: "2026-11-26T15:59:00Z",
          availableAt: "2026-11-26T16:00:00Z",
          url: "https://bscscan.com/tx/example",
        },
      ],
    );
    expect(text).toContain("lower-priority research digest");
    expect(text).toContain(
      "15:59:00.000Z; first local availability: 2026-11-26T16:00:00.000Z",
    );
    expect(text).toContain("Partial history");
    expect(text).toContain("https://flownix.xyz/token/");
  });
  it("single-attempt mode never retries ambiguous sends", async () => {
    let calls = 0;
    const http = new HttpClient(
      "telegram",
      20,
      async () => {},
      async () => {
        calls++;
        throw Error("timeout");
      },
      async () => {},
      1,
    );
    await expect(
      http.json("https://example.com", (b) => b),
    ).rejects.toBeDefined();
    expect(calls).toBe(1);
  });
});
