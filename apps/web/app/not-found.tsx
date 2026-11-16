import Link from "next/link";
export default function NotFound() {
  return (
    <main className="login">
      <h1>This evidence isn’t here</h1>
      <p>The page or chain/contract identity could not be found.</p>
      <Link className="button primary" href="/">
        Return to Alpha Radar
      </Link>
    </main>
  );
}
