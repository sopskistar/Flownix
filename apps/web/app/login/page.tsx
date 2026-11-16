import { oauthConfiguration } from "@flownix/core";
import { AuthButton } from "../../components/auth-controls";
export const dynamic = "force-dynamic";
export const metadata = { title: "Private access" };
export default function Login() {
  const configuration = oauthConfiguration();
  const remoteMode = process.env.ACCESS_MODE === "oauth";
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
      {configuration.ready ? (
        <>
          <AuthButton kind="signin" />
          <p className="muted">
            Access is restricted to the configured GitHub account.
          </p>
        </>
      ) : (
        <div className="notice">
          <strong>
            {remoteMode
              ? "Production sign-in needs configuration"
              : "Remote access is locked"}
          </strong>
          {remoteMode ? (
            <>
              <p>
                The operator must configure these server-side variables before
                GitHub sign-in can start:
              </p>
              <ul>
                {[
                  ...new Set([
                    ...configuration.missing,
                    ...configuration.invalid,
                  ]),
                ].map((name) => (
                  <li key={name}>
                    <code>{name}</code>
                  </li>
                ))}
              </ul>
              <p>
                Private routes remain locked. Credentials are never entered in
                this page.
              </p>
            </>
          ) : (
            <p>
              Local mode requires the development server at 127.0.0.1. To
              deploy, configure GitHub OAuth, an allowed GitHub login, a session
              secret, and ACCESS_MODE=oauth.
            </p>
          )}
        </div>
      )}
      <p className="muted">
        Independent research platform. Not affiliated with Binance.
      </p>
    </main>
  );
}
