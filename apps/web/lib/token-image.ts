import {
  officialAssetUrl,
  providerFetch,
  rasterContentType,
} from "@flownix/core";

// Process-local, bounded cache of public CDN bytes, never private research or prices.
// URLs and verification times remain in the existing durable registry snapshots.
const cache = new Map<
  string,
  { bytes: Uint8Array; type: string; expires: number }
>();
const pending = new Map<string, Promise<{ bytes: Uint8Array; type: string }>>();
const MAX_BYTES = 512 * 1024;
export async function tokenImage(
  url: string,
  fetcher: typeof fetch = providerFetch,
) {
  if (!officialAssetUrl(url)) throw Error("INVALID_IMAGE_SOURCE");
  const saved = cache.get(url);
  if (saved && saved.expires > Date.now()) return saved;
  if (pending.has(url)) return pending.get(url)!;
  if (pending.size >= 32) throw Error("IMAGE_FETCH_BUSY");
  const request = (async () => {
    const r = await fetcher(url, {
      redirect: "error",
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "image/png,image/jpeg,image/webp" },
    });
    if (!r.ok || !r.body) throw Error("IMAGE_UNAVAILABLE");
    const reader = r.body.getReader(),
      chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > MAX_BYTES) {
          await reader.cancel();
          throw Error("IMAGE_TOO_LARGE");
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(Buffer.concat(chunks, size));
    const type = rasterContentType(bytes);
    // Official CDN responses can omit MIME, use octet-stream, or mislabel JPEG
    // as PNG. Validate the raster bytes and serve their actual detected type.
    const declared = r.headers.get("content-type")?.split(";")[0].trim();
    if (
      !type ||
      (declared &&
        ![
          "application/octet-stream",
          "image/png",
          "image/jpeg",
          "image/webp",
        ].includes(declared))
    )
      throw Error("INVALID_IMAGE_TYPE");
    if (cache.size >= 128) cache.delete(cache.keys().next().value!);
    const result = { bytes, type, expires: Date.now() + 6 * 3600_000 };
    cache.set(url, result);
    return result;
  })();
  pending.set(url, request);
  try {
    return await request;
  } finally {
    pending.delete(url);
  }
}
