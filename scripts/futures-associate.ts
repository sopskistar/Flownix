import { readFile } from "node:fs/promises";
import {
  futuresAssociationProofSchema,
  FuturesProvider,
  HttpClient,
  exactFuturesAssociation,
  hashResponse,
  networkErrorCode,
  closeProviderNetwork,
  installRequestPolicy,
} from "../packages/core/src/index";
import {
  sqlClient,
  closeDb,
  auditRequest,
  jsonParam,
  workerRequestPolicy,
  saveSource,
} from "../packages/db/src/index";
process.env.DATABASE_URL =
  process.env.DATABASE_URL_WORKER ?? process.env.DATABASE_URL;
const timer = setInterval(() => {}, 1000);
try {
  if (!process.argv[2]) throw Error("EVIDENCE_FILE_REQUIRED");
  const proof = futuresAssociationProofSchema.parse(
    JSON.parse(await readFile(process.argv[2], "utf8")),
  );
  const sql = sqlClient();
  installRequestPolicy(workerRequestPolicy(sql));
  const token = (
    await sql`SELECT * FROM alpha_tokens WHERE id=${proof.tokenId} AND status='current'`
  )[0];
  if (!token) throw Error("CURRENT_ALPHA_IDENTITY_REQUIRED");
  const exchange = await new FuturesProvider(
    new HttpClient("binance_futures", 20, auditRequest),
  ).exchange();
  const now = new Date().toISOString();
  const association = {
    ...proof,
    contractType: "PERPETUAL",
    verified: true,
    verifiedAt: now,
    validFrom: now,
    validTo: null,
  };
  const instrument = exchange.data.symbols.find(
    (i) => i.symbol === proof.symbol,
  );
  if (
    !instrument ||
    !exactFuturesAssociation(
      { id: token.id, chain: token.chain_id, contract: token.contract },
      association,
      instrument,
      now,
    )
  )
    throw Error("FUTURES_IDENTITY_MISMATCH");
  if (
    new URL(proof.projectLinkSource).hostname !== "www.binance.com" ||
    new URL(proof.instrumentSource).origin !== "https://fapi.binance.com"
  )
    throw Error("OFFICIAL_LISTING_SOURCE_REQUIRED");
  console.log(
    JSON.stringify({
      ok: true,
      tokenId: token.id,
      symbol: proof.symbol,
      applied: process.argv.includes("--apply-reviewed-evidence"),
      warning:
        "Source hashes and exact contract/project linkage must have been independently reviewed. This tool checks identity constraints and instrument metadata; it does not certify arbitrary supplied web claims.",
    }),
  );
  if (process.argv.includes("--apply-reviewed-evidence")) {
    await saveSource("binance_futures", exchange);
    await sql`INSERT INTO futures_associations(token_id,symbol,base_asset,contract_type,multiplier,token_source,instrument_source,verified_at,valid_from,evidence) VALUES(${proof.tokenId},${proof.symbol},${proof.baseAsset},'PERPETUAL',${proof.multiplier},${proof.tokenSource},${proof.instrumentSource},${now},${now},${jsonParam(proof)}::jsonb) ON CONFLICT(token_id) DO UPDATE SET symbol=excluded.symbol,base_asset=excluded.base_asset,contract_type=excluded.contract_type,multiplier=excluded.multiplier,token_source=excluded.token_source,instrument_source=excluded.instrument_source,verified_at=excluded.verified_at,valid_from=excluded.valid_from,valid_to=NULL,evidence=excluded.evidence`;
    await sql`INSERT INTO research_feature_snapshots(feature_hash,kind,computed_at,available_at,evidence) VALUES(${hashResponse(JSON.stringify({ proof, now }))},'futures_association',${now},${now},${jsonParam(proof)}::jsonb)`;
  }
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      error:
        error instanceof Error && /^[A-Z_]+$/.test(error.message)
          ? error.message
          : networkErrorCode(error),
    }),
  );
  process.exitCode = 1;
} finally {
  installRequestPolicy(undefined);
  await closeDb();
  await closeProviderNetwork();
  clearInterval(timer);
}
