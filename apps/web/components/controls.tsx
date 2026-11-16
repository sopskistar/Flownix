"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
export function ThemeToggle() {
  const [theme, setTheme] = useState("dark");
  useEffect(() => {
    const saved = localStorage.getItem("flownix-theme") ?? "dark";
    document.documentElement.dataset.theme = saved;
    setTheme(saved);
  }, []);
  return (
    <button
      className="quiet"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      onClick={() => {
        const t = theme === "dark" ? "light" : "dark";
        setTheme(t);
        localStorage.setItem("flownix-theme", t);
        document.documentElement.dataset.theme = t;
      }}
    >
      {theme === "dark" ? "Light mode" : "Dark mode"}
    </button>
  );
}
export function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="quiet"
      aria-label="Copy address"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(address);
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
export async function action(payload: Record<string, unknown>) {
  const r = await fetch("/api/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const b = await r.json();
  if (!r.ok) throw Error(b.error ?? "Request failed");
  return b;
}
export function ActionButton({
  payload,
  children,
  className = "quiet",
}: {
  payload: Record<string, unknown>;
  children: React.ReactNode;
  className?: string;
}) {
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  const router = useRouter();
  return (
    <span className="action-wrap">
      <button
        className={className}
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setMessage("");
          try {
            const r = await action(payload);
            setMessage(r.message ?? "Saved");
            router.refresh();
          } catch (e) {
            setMessage(e instanceof Error ? e.message : "Failed");
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "Saving…" : children}
      </button>
      <span role="status" className="feedback">
        {message}
      </span>
    </span>
  );
}
export function ResearchNote({
  tokenId,
  signalId,
  chain,
  address,
}: {
  tokenId?: string;
  signalId?: string;
  chain?: string;
  address?: string;
}) {
  const [text, setText] = useState(""),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState(false);
  const router = useRouter();
  return (
    <form
      className="note-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        try {
          await action({
            action: "note",
            tokenId,
            signalId,
            chain,
            address,
            body: text,
          });
          setText("");
          setMessage("Journal note saved");
          router.refresh();
        } catch (e) {
          setMessage(e instanceof Error ? e.message : "Failed");
        } finally {
          setPending(false);
        }
      }}
    >
      <label>
        Research note or hypothesis
        <textarea
          required
          minLength={3}
          maxLength={5000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What does the evidence support? What would invalidate the thesis?"
        />
      </label>
      <div className="row">
        <button className="primary" disabled={pending}>
          {pending ? "Saving…" : "Save note"}
        </button>
        <span role="status">{message}</span>
      </div>
    </form>
  );
}
export function SearchShortcut() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);
  return (
    <form action="/" className="global-search">
      <input
        ref={ref}
        type="search"
        name="q"
        aria-label="Search Alpha tokens, Control K"
        placeholder="Search Alpha tokens  ⌘ K"
      />
    </form>
  );
}
