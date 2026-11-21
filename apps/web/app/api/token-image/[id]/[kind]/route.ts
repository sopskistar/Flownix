import { sqlClient } from "@flownix/db";
import { officialAssetUrl, tokenVisual } from "@flownix/core";
import { accessAllowed } from "../../../../../lib/auth";
import { tokenImage } from "../../../../../lib/token-image";

export const runtime = "nodejs";
type ImageSources = { token: string | null; network: string | null };
const identities = new Map<
  string,
  { sources: ImageSources; expires: number }
>();
const resolving = new Map<string, Promise<ImageSources>>();
async function imageSources(id: string): Promise<ImageSources> {
  const cached = identities.get(id);
  if (cached && cached.expires > Date.now()) return cached.sources;
  const pending = resolving.get(id);
  if (pending) return pending;
  if (resolving.size >= 32) throw Error("IMAGE_METADATA_BUSY");
  const request = (async () => {
    const rows =
      await sqlClient()`SELECT id,symbol,name,chain_id,contract,metadata,source,response_hash,last_seen FROM alpha_tokens WHERE id=${id}`;
    const row = rows[0],
      visual = tokenVisual(row);
    const sources = {
      token: visual.logo ? officialAssetUrl(row.metadata.iconUrl) : null,
      network: visual.networkLogo
        ? officialAssetUrl(row.metadata.chainIconUrl)
        : null,
    };
    if (identities.size >= 256)
      identities.delete(identities.keys().next().value!);
    identities.set(id, { sources, expires: Date.now() + 60_000 });
    return sources;
  })();
  resolving.set(id, request);
  try {
    return await request;
  } finally {
    resolving.delete(id);
  }
}
export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; kind: string }>;
  },
) {
  if (!(await accessAllowed())) return new Response(null, { status: 401 });
  const { id, kind } = await params;
  if (!/^[a-f0-9]{32}$/.test(id) || !["token", "network"].includes(kind))
    return new Response(null, { status: 404 });
  try {
    const sources = await imageSources(id);
    const url = kind === "token" ? sources.token : sources.network;
    if (!url) return new Response(null, { status: 404 });
    const result = await tokenImage(url);
    return new Response(new Uint8Array(result.bytes).buffer, {
      headers: {
        "Content-Type": result.type,
        "Cache-Control": "private, max-age=3600, must-revalidate",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
