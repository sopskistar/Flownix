"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { action } from "./controls";
export function MutationForm({
  actionName,
  children,
  extra = {},
  label = "Save",
}: {
  actionName: string;
  children: React.ReactNode;
  extra?: Record<string, unknown>;
  label?: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState(""),
    [pending, setPending] = useState(false),
    [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  return (
    <form
      className="mutation-form"
      method="post"
      aria-busy={!hydrated || pending}
      onSubmit={async (e) => {
        e.preventDefault();
        const fields = Object.fromEntries(
          new FormData(e.currentTarget).entries(),
        );
        setPending(true);
        try {
          const r = await action({ action: actionName, ...fields, ...extra });
          setMessage(r.message ?? "Saved");
          router.refresh();
        } catch (e) {
          setMessage(e instanceof Error ? e.message : "Failed");
        } finally {
          setPending(false);
        }
      }}
    >
      <fieldset disabled={!hydrated || pending} style={{ display: "contents" }}>
        {children}
        <div className="row">
          <button className="primary" disabled={!hydrated || pending}>
            {pending ? "Saving…" : label}
          </button>
          <span role="status">{message}</span>
        </div>
      </fieldset>
    </form>
  );
}
export function PaperEntry({
  tokens,
}: {
  tokens: { id: string; symbol: string; chain_id: string }[];
}) {
  return (
    <MutationForm actionName="paper_enter" label="Record simulated entry">
      <div className="form-grid">
        <label>
          Verified Alpha identity
          <select name="tokenId" required>
            <option value="">Select token</option>
            {tokens.map((t) => (
              <option key={t.id} value={t.id}>
                {t.symbol} / chain {t.chain_id} / {t.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Budget (quote units)
          <input
            name="budget"
            type="number"
            min="1"
            max="1000000"
            defaultValue="10000"
            required
          />
        </label>
        <label>
          Notional (quote units)
          <input
            name="notional"
            type="number"
            min="1"
            max="10000"
            defaultValue="100"
            required
          />
        </label>
        <label>
          Fee per side (basis points)
          <input
            name="feeBps"
            type="number"
            min="0"
            max="500"
            defaultValue="30"
            required
          />
        </label>
        <label>
          Slippage per side (basis points)
          <input
            name="slippageBps"
            type="number"
            min="10"
            max="2000"
            defaultValue="100"
            required
          />
        </label>
        <label>
          Gas per side (quote units)
          <input
            name="gasQuote"
            type="number"
            min="0"
            max="100"
            step="0.01"
            defaultValue="2"
            required
          />
        </label>
      </div>
      <label>
        Entry rationale
        <textarea
          name="note"
          maxLength={2000}
          placeholder="Thesis, invalidation conditions and planned holding period"
        />
      </label>
    </MutationForm>
  );
}
