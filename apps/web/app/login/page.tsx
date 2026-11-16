import Link from "next/link";
export const dynamic = "force-dynamic";
export const metadata = { title: "Private access" };
export default function Login() {
  const enabled =
    process.env.ACCESS_MODE === "oauth" &&
    !!process.env.GITHUB_CLIENT_ID &&
    !!process.env.NEXTAUTH_SECRET;
  return (
    <main className="login">
      <img
        src="/brand/mark-dark.svg"
        width="64"
        height="64"
        alt="Flownix flow mark"
      />
      <h1>Your private research workspace</h1>
      <p>
        Flownix studies long-term Binance Alpha activity through timestamped
        evidence.
      </p>
      {enabled ? (
        <Link className="button primary" href="/api/auth/signin/github">
          Continue with GitHub
        </Link>
      ) : (
        <div className="notice">
          <strong>Remote access is locked</strong>
          <p>
            Local mode requires the development server at 127.0.0.1. To deploy,
            configure GitHub OAuth, an allowed GitHub login, a session secret,
            and ACCESS_MODE=oauth.
          </p>
        </div>
      )}
      <p className="muted">
        Independent research platform. Not affiliated with Binance.
      </p>
    </main>
  );
}
