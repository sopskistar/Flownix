import { describe, it, expect } from "vitest";
import fixture from "../../../tests/fixtures/alpha-visual-2026-11-21.json";
import {
  tokenVisual,
  officialAssetUrl,
  tokenKey,
  rasterContentType,
} from "../src/index";

const row = (entry = fixture.entries[0]) => ({
  id: tokenKey(entry.chainId, entry.contractAddress),
  chain_id: entry.chainId,
  contract: entry.contractAddress,
  symbol: entry.symbol,
  name: entry.name,
  metadata: entry,
  source: fixture.manifest.source,
  response_hash: fixture.manifest.parentResponseHash,
  last_seen: fixture.manifest.observedAt,
});
describe("Official Alpha visual identity trust boundary", () => {
  it("maps real official identities and chain icons across all ten registry networks", () => {
    const chains = new Set<string>();
    for (const entry of fixture.entries) {
      const stored = row(entry),
        visual = tokenVisual(stored);
      expect(officialAssetUrl(entry.iconUrl)).toBe(entry.iconUrl);
      expect(officialAssetUrl(entry.chainIconUrl)).toBe(entry.chainIconUrl);
      expect(visual.logo).toContain(`/api/token-image/${stored.id}/token?v=`);
      expect(visual.networkLogo).toContain(
        `/api/token-image/${stored.id}/network?v=`,
      );
      expect(visual.verifiedAt).toBe(fixture.manifest.observedAt);
      chains.add(visual.chainId);
    }
    expect(chains.size).toBe(10);
    expect(
      tokenVisual(row(fixture.entries.find((t) => t.chainId === "4663")!))
        .chainName,
    ).toBe("Robinhood Chain");
  });
  it("never attaches another project's image through a shared ticker", () => {
    const collisions = fixture.entries
      .filter((t) => t.symbol === "WARD")
      .map((t) => tokenVisual(row(t)));
    expect(collisions).toHaveLength(2);
    expect(collisions[0].name).not.toBe(collisions[1].name);
    expect(collisions[0].logo).not.toBe(collisions[1].logo);
    const first = row(),
      other = row(fixture.entries[1]);
    other.symbol = first.symbol;
    expect(tokenVisual(other).logo).not.toBe(tokenVisual(first).logo);
    expect(tokenVisual({ ...other, metadata: first.metadata }).logo).toBeNull();
    expect(tokenVisual({ ...first, chain_id: "8453" }).logo).toBeNull();
    expect(
      tokenVisual({ ...first, contract: other.contract }).networkLogo,
    ).toBeNull();
    expect(tokenVisual({ ...first, id: other.id }).logo).toBeNull();
  });
  it("preserves case-sensitive mints and requires official provenance", () => {
    const sol = row(fixture.entries.find((t) => t.chainId === "CT_501")!);
    expect(
      tokenVisual({ ...sol, contract: sol.contract.toLowerCase() }).logo,
    ).toBeNull();
    for (const patch of [
      { source: "https://example.com" },
      { response_hash: "" },
      { last_seen: "invalid" },
    ])
      expect(tokenVisual({ ...sol, ...patch }).logo).toBeNull();
    expect(
      tokenVisual({ ...sol, metadata: { ...sol.metadata, iconUrl: null } })
        .logo,
    ).toBeNull();
    expect(tokenVisual(null).logo).toBeNull();
  });
  it.each([
    "http://bin.bnbstatic.com/images/web3-data/public/token/logos/x.png",
    "https://bin.bnbstatic.com.evil.test/images/web3-data/public/token/logos/x.png",
    "https://user@bin.bnbstatic.com/images/web3-data/public/token/logos/x.png",
    "https://127.0.0.1/logo.png",
    "data:image/png;base64,AAAA",
    "javascript:alert(1)",
    "https://bin.bnbstatic.com/images/web3-data/public/token/logos/x.svg",
    "https://bin.bnbstatic.com/images/web3-data/public/token/logos/x.png?redirect=https://evil.test",
    "https://bin.bnbstatic.com/arbitrary.png",
    "https://bin.bnbstatic.com/images/web3-data/public/token/logos/%2e%2e/x.png",
  ])("rejects unsafe asset URL %s", (url) =>
    expect(officialAssetUrl(url)).toBeNull(),
  );
  it("rejects HTML and SVG bytes regardless of file extension", () => {
    expect(
      rasterContentType(
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      ),
    ).toBeNull();
    expect(
      rasterContentType(Buffer.from("<html>not an image</html>")),
    ).toBeNull();
  });
});
