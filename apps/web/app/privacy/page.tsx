import Link from "next/link";
export const metadata = { title: "Privacy" };
export default function Privacy() {
  return (
    <main className="login">
      <h1>Private by design</h1>
      <p>
        Flownix stores research notes, watchlists, public blockchain
        observations and simulation records in your configured PostgreSQL
        database. No analytics or advertising services are enabled.
      </p>
      <p>
        GitHub OAuth, when configured, restricts access to one allowlisted
        account. Optional Telegram sends alert text to your configured chat.
        Data providers receive requests for public chain or market data.
        Provider secrets remain on the server.
      </p>
      <p>
        The operator controls database backups, retention, deletion and hosting.
        This local research application has no subscription or trading
        execution.
      </p>
      <Link href="/">Return to workspace</Link>
    </main>
  );
}
