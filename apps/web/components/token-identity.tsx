"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { TokenVisual } from "@flownix/core";

function IdentityImage({
  src,
  label,
  network = false,
}: {
  src: string | null;
  label: string;
  network?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  return (
    <span
      className={network ? "token-network-icon" : "token-avatar"}
      aria-hidden="true"
    >
      <span className="token-initial">
        {Array.from(label)
          .slice(0, network ? 1 : 2)
          .join("") || "?"}
      </span>
      {src && failed !== src ? (
        <Image
          src={src}
          alt=""
          width={network ? 16 : 36}
          height={network ? 16 : 36}
          unoptimized
          loading="lazy"
          style={{ opacity: loaded === src ? 1 : 0 }}
          onLoad={() => setLoaded(src)}
          onError={() => setFailed(src)}
        />
      ) : null}
    </span>
  );
}

export function TokenIdentity({
  token,
  heading = false,
}: {
  token: TokenVisual;
  heading?: boolean;
}) {
  return (
    <Link
      className={`token-identity${heading ? " token-identity-heading" : ""}`}
      href={`/token/${token.id}`}
    >
      <span
        className="token-portrait"
        title={
          token.verifiedAt
            ? `Official Alpha registry identity verified ${token.verifiedAt}`
            : "Logo unavailable"
        }
      >
        <IdentityImage key={token.id} src={token.logo} label={token.symbol} />
        <IdentityImage
          key={`${token.id}:network`}
          src={token.networkLogo}
          label={token.chainName}
          network
        />
      </span>
      <span className="token-identity-text">
        <strong>{token.symbol}</strong>
        <span className="token-project-name">
          {token.name || "Name unavailable"}
        </span>
        <span className="token-network-name">
          {token.chainName} / {token.contract.slice(0, 6)}…
          {token.contract.slice(-4)}
        </span>
      </span>
    </Link>
  );
}
