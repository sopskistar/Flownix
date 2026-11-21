import { describe, it, expect, vi } from "vitest";
const fetcher = vi.fn<typeof fetch>();
import { tokenImage } from "../apps/web/lib/token-image";
const url = (name: string) =>
  `https://bin.bnbstatic.com/images/web3-data/public/token/logos/${name}.png`;
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXaQAAAAASUVORK5CYII=",
  "base64",
);
describe("Bounded same-origin image loader", () => {
  it("validates raster bytes and coalesces/cache hits without forwarding credentials", async () => {
    fetcher.mockResolvedValueOnce(
      new Response(png, { headers: { "content-type": "image/png" } }),
    );
    const [a, b] = await Promise.all([
      tokenImage(url("cache"), fetcher),
      tokenImage(url("cache"), fetcher),
    ]);
    expect(a.bytes).toEqual(new Uint8Array(png));
    expect(b.type).toBe("image/png");
    await tokenImage(url("cache"), fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      redirect: "error",
      headers: { Accept: "image/png,image/jpeg,image/webp" },
    });
  });
  it("refuses arbitrary origins before making any request", async () => {
    fetcher.mockClear();
    await expect(
      tokenImage("https://evil.test/logo.png", fetcher),
    ).rejects.toThrow("INVALID_IMAGE_SOURCE");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([null, "application/octet-stream", "image/jpeg"])(
    "serves detected raster type despite official CDN MIME %s",
    async (mime) => {
      fetcher.mockResolvedValueOnce(
        new Response(new Uint8Array(png), {
          headers: mime ? { "content-type": mime } : {},
        }),
      );
      await expect(
        tokenImage(
          url(`mime-${mime?.replaceAll("/", "-") ?? "missing"}`),
          fetcher,
        ),
      ).resolves.toMatchObject({ type: "image/png" });
    },
  );
  it("rejects oversized, broken and active-content images", async () => {
    fetcher.mockResolvedValueOnce(
      new Response(new Uint8Array(512 * 1024 + 1), {
        headers: { "content-type": "image/png" },
      }),
    );
    await expect(tokenImage(url("oversized"), fetcher)).rejects.toThrow(
      "IMAGE_TOO_LARGE",
    );
    fetcher.mockResolvedValueOnce(
      new Response("<svg/>", { headers: { "content-type": "image/png" } }),
    );
    await expect(tokenImage(url("svg"), fetcher)).rejects.toThrow(
      "INVALID_IMAGE_TYPE",
    );
    fetcher.mockResolvedValueOnce(
      new Response(png, { headers: { "content-type": "text/html" } }),
    );
    await expect(tokenImage(url("wrong-type"), fetcher)).rejects.toThrow(
      "INVALID_IMAGE_TYPE",
    );
    fetcher.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(tokenImage(url("missing"), fetcher)).rejects.toThrow(
      "IMAGE_UNAVAILABLE",
    );
  });
});
