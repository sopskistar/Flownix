import Link from "next/link";
import { Navigation } from "./nav";
import { ThemeToggle, SearchShortcut } from "./controls";
export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to research
      </a>
      <header className="mast">
        <div className="mast-inner">
          <Link href="/" className="brand" aria-label="Flownix home">
            <svg viewBox="0 0 40 40" aria-hidden="true">
              <path d="M6 9h11c8 0 8 11 16 11M6 20h27M6 31h11c8 0 8-11 16-11" />
              <path d="M12 9v22" />
            </svg>
            <span>Flownix</span>
          </Link>
          <span className="independent">Independent Alpha intelligence</span>
          <SearchShortcut />
          <ThemeToggle />
        </div>
      </header>
      <div className="nav-container">
        <Navigation />
      </div>
      <main id="main">{children}</main>
      <footer>
        <span>Flownix / private research workspace</span>
        <span>Evidence before inference. Simulation only.</span>
        <Link href="/privacy">Privacy</Link>
      </footer>
    </>
  );
}
