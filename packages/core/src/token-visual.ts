import { contractIdentity, tokenKey } from "./identity";

export const ALPHA_REGISTRY_SOURCE =
  "https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/cex/alpha/all/token/list";

export type TokenVisual = {
  id: string;
  symbol: string;
  name: string;
  chainId: string;
  chainName: string;
  contract: string;
  logo: string | null;
  networkLogo: string | null;
  source: string | null;
  verifiedAt: string | null;
  responseHash: string | null;
};

const networkNames: Record<string, string> = {
  "56": "BSC",
  "1": "Ethereum",
  "8453": "Base",
  "42161": "Arbitrum",
  CT_501: "Solana",
  "146": "Sonic",
  "4663": "Robinhood Chain",
  CT_784: "Sui",
  CT_195: "TRON",
  "59144": "Linea",
};

/** Only raster assets on the official registry's observed CDN paths. No URL rewriting. */
export function officialAssetUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 512) return null;
  try {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      u.hostname !== "bin.bnbstatic.com" ||
      u.port ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      u.href !== value
    )
      return null;
    return /^\/(?:images\/web3-data\/public\/token\/logos\/[a-zA-Z0-9_-]+|image\/admin_mgs_image_upload\/\d{8}\/[a-zA-Z0-9_-]+|static\/chain-infra\/[a-zA-Z0-9_-]+)\.(?:png|jpe?g|webp)$/i.test(
      u.pathname,
    )
      ? u.href
      : null;
  } catch {
    return null;
  }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Accept a stored official row only; never resolve or inherit an image by ticker. */
export function tokenVisual(value: unknown): TokenVisual {
  const row = record(value),
    meta = record(row.metadata);
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const id = str(row.id),
    chainId = str(row.chain_id),
    contract = str(row.contract);
  const at =
    row.last_seen instanceof Date
      ? row.last_seen.toISOString()
      : str(row.last_seen);
  const verified =
    id === tokenKey(chainId, contract) &&
    row.source === ALPHA_REGISTRY_SOURCE &&
    /^[a-f0-9]{64}$/.test(str(row.response_hash)) &&
    Number.isFinite(Date.parse(at)) &&
    meta.chainId === chainId &&
    typeof meta.contractAddress === "string" &&
    contractIdentity(chainId, meta.contractAddress).contract ===
      contractIdentity(chainId, contract).contract;
  const version = verified ? `?v=${str(row.response_hash)}` : "";
  return {
    id,
    symbol: str(row.symbol),
    name: str(row.name),
    chainId,
    contract,
    chainName: networkNames[chainId] ?? (str(meta.chainName) || chainId),
    logo:
      verified && officialAssetUrl(meta.iconUrl)
        ? `/api/token-image/${id}/token${version}`
        : null,
    networkLogo:
      verified && officialAssetUrl(meta.chainIconUrl)
        ? `/api/token-image/${id}/network${version}`
        : null,
    source: verified ? ALPHA_REGISTRY_SOURCE : null,
    verifiedAt: verified ? at : null,
    responseHash: verified ? str(row.response_hash) : null,
  };
}

export function rasterContentType(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 24 &&
    bytes[0] === 137 &&
    Buffer.from(bytes.subarray(1, 8)).equals(
      Buffer.from([80, 78, 71, 13, 10, 26, 10]),
    )
  )
    return "image/png";
  if (
    bytes.length >= 12 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  )
    return "image/jpeg";
  if (
    bytes.length >= 16 &&
    Buffer.from(bytes.subarray(0, 4)).toString() === "RIFF" &&
    Buffer.from(bytes.subarray(8, 12)).toString() === "WEBP"
  )
    return "image/webp";
  return null;
}
