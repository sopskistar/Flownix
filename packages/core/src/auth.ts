export type OAuthEnvironment = Record<string, string | undefined>;
export function oauthConfiguration(env: OAuthEnvironment = process.env) {
  const required = [
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
    "NEXTAUTH_SECRET",
    "GITHUB_ALLOWED_LOGIN",
    "NEXTAUTH_URL",
  ] as const;
  const missing = required.filter((key) => !env[key]?.trim());
  const invalid: string[] = [];
  if (env.ACCESS_MODE !== "oauth") invalid.push("ACCESS_MODE");
  if (env.NEXTAUTH_SECRET && env.NEXTAUTH_SECRET.length < 32)
    invalid.push("NEXTAUTH_SECRET");
  if (
    env.GITHUB_ALLOWED_LOGIN &&
    !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(env.GITHUB_ALLOWED_LOGIN)
  )
    invalid.push("GITHUB_ALLOWED_LOGIN");
  let origin: string | null = null;
  if (env.NEXTAUTH_URL) {
    try {
      const url = new URL(env.NEXTAUTH_URL);
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      if (
        (url.protocol !== "https:" &&
          !(
            env.NODE_ENV !== "production" &&
            local &&
            url.protocol === "http:"
          )) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== "/"
      )
        invalid.push("NEXTAUTH_URL");
      else origin = url.origin;
    } catch {
      invalid.push("NEXTAUTH_URL");
    }
  }
  return {
    ready: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
    origin,
    callbackUrl: origin ? `${origin}/api/auth/callback/github` : null,
  };
}
export function githubLoginAllowed(
  login: unknown,
  env: OAuthEnvironment = process.env,
) {
  return (
    oauthConfiguration(env).ready &&
    typeof login === "string" &&
    login.toLowerCase() === env.GITHUB_ALLOWED_LOGIN?.toLowerCase()
  );
}
