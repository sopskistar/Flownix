"use client";
import { signIn, signOut } from "next-auth/react";
import { useState } from "react";
export function AuthButton({ kind }: { kind: "signin" | "signout" }) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="action-wrap">
      <button
        className={kind === "signin" ? "primary" : "quiet"}
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError("");
          try {
            if (kind === "signin") await signIn("github", { callbackUrl: "/" });
            else await signOut({ callbackUrl: "/login" });
          } catch {
            setError("Unable to complete authentication. Try again.");
            setPending(false);
          }
        }}
      >
        {pending
          ? kind === "signin"
            ? "Connecting…"
            : "Signing out…"
          : kind === "signin"
            ? "Continue with GitHub"
            : "Sign out"}
      </button>
      <span className="feedback" role="status">
        {error}
      </span>
    </div>
  );
}
