import { z } from "zod";
export const catalystKinds = [
  "social",
  "alpha_admission",
  "tge",
  "airdrop_announcement",
  "airdrop_distribution",
  "unlock",
  "futures_listing",
  "spot_listing",
  "upbit_listing",
  "project_announcement",
] as const;
export const researchLeadSchema = z.object({
  action: z.literal("research_lead"),
  tokenId: z.string().regex(/^[a-f0-9]{32}$/),
  kind: z.enum(catalystKinds),
  sourceUrl: z
    .url()
    .max(2000)
    .refine((s) => new URL(s).protocol === "https:"),
  author: z.string().max(100).default(""),
  claimedPublishedAt: z
    .union([z.iso.datetime({ offset: true }), z.literal("")])
    .default(""),
  claimedEventAt: z
    .union([z.iso.datetime({ offset: true }), z.literal("")])
    .default(""),
  body: z.string().min(10).max(3000),
  revisionOf: z.union([z.uuid(), z.literal("")]).default(""),
});
export const socialResearchLeads = [
  "eveningtraders",
  "JuliusElum",
  "bsc_daily",
  "TraderGPFX",
  "Ryker_BTC",
  "BinanceWallet",
  "BinanceResearch",
  "ArkhamIntel",
  "Bitquery",
];
/** Manual publication claims are never backdated into a validated strategy feature. */
export function leadKnowableAt(
  lead: {
    firstObservedAt: string;
    verifiedAt: string | null;
    publishedAt: string | null;
  },
  asOf: string,
) {
  return (
    !!lead.verifiedAt &&
    !!lead.publishedAt &&
    [lead.firstObservedAt, lead.verifiedAt, lead.publishedAt].every(
      (s) =>
        Number.isFinite(Date.parse(s!)) && Date.parse(s!) <= Date.parse(asOf),
    )
  );
}
