"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
const links = [
  ["/", "Alpha Radar"],
  ["/watchlist", "Accumulation Watchlist"],
  ["/signals", "Alerts"],
  ["/journal", "Journal"],
  ["/research", "Runner Lab"],
  ["/paper", "Performance Lab"],
  ["/clusters", "Wallet Intelligence"],
  ["/settings", "Data Health"],
];
export function Navigation() {
  const path = usePathname(),
    router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 60000);
    return () => clearInterval(t);
  }, [router]);
  return (
    <nav aria-label="Main navigation">
      {links.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          aria-current={path === href ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
