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
        if (!/^0x[0-9a-fA-F]{40}$/.test(a)) {
          setError("Enter a valid 20-byte EVM address");
          return;
        }
        router.push(`/wallet/${d.get("chain")}/${a.toLowerCase()}`);
      }}
    >
      <label>
        Network
        <select name="chain">
          <option value="56">BSC</option>
          <option value="1">Ethereum</option>
          <option value="8453">Base</option>
        </select>
      </label>
      <label className="search-filter">
        Wallet address
        <input
          name="address"
          required
          placeholder="0x…"
          minLength={42}
          maxLength={42}
        />
      </label>
      <button className="primary">Investigate</button>
      <span role="alert">{error}</span>
    </form>
  );
}
