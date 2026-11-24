"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  // No unattended server polling: it would keep Neon awake even while the
  // collector sleeps. Navigation, reload and completed actions still refresh.
  const path = usePathname();
  return (
    <nav aria-label="Main navigation">
      {links.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          prefetch={false}
          aria-current={path === href ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
