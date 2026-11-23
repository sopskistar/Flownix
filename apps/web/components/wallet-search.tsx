"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function WalletSearch() {
  const router = useRouter(),
    [error, setError] = useState("");
  return (
    <form
      className="filters"
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget),
          a = String(d.get("address"));
        const chain = String(d.get("chain"));
        if (
          !(chain === "CT_501"
            ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)
            : /^0x[0-9a-fA-F]{40}$/.test(a))
        ) {
          setError("Enter a valid address for the selected network");
          return;
        }
        router.push(
          `/wallet/${chain}/${chain === "CT_501" ? a : a.toLowerCase()}`,
        );
      }}
    >
      <label>
        Network
        <select name="chain">
          <option value="56">BSC</option>
          <option value="1">Ethereum</option>
          <option value="8453">Base</option>
          <option value="42161">Arbitrum One</option>
          <option value="CT_501">Solana</option>
        </select>
      </label>
      <label className="search-filter">
        Wallet address
        <input
          name="address"
          required
          placeholder="0x…"
          minLength={32}
          maxLength={44}
        />
      </label>
      <button className="primary">Investigate</button>
      <span role="alert">{error}</span>
    </form>
  );
}
