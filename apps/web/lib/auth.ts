import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession, type NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import {
  localAccessAllowed,
  oauthConfiguration,
  githubLoginAllowed,
} from "@flownix/core";
export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  useSecureCookies:
    process.env.NODE_ENV === "production" ||
    process.env.NEXTAUTH_URL?.startsWith("https://"),
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID ?? "unconfigured",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "unconfigured",
    }),
  ],
  session: { strategy: "jwt", maxAge: 8 * 3600 },
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, profile }) {
      if (profile)
        token.login = (profile as { login?: string }).login?.toLowerCase();
      return token;
    },
    async session({ session, token }) {
      (session as typeof session & { allowedLogin?: string }).allowedLogin =
        typeof token.login === "string" ? token.login : undefined;
      return session;
    },
    async signIn({ profile }) {
      const p = profile as { login?: string } | undefined;
      return githubLoginAllowed(p?.login);
    },
  },
};
export async function accessAllowed() {
  const h = await headers();
  const host = h.get("host");
  const forwardedFor = h.get("x-forwarded-for");
  const forwardedHost = h.get("x-forwarded-host");
  const suspicious =
    h.has("forwarded") ||
    (!!forwardedFor &&
      !forwardedFor
        .split(",")
        .every((v) =>
          ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(v.trim()),
        )) ||
    (!!forwardedHost && forwardedHost !== host);
  if (
    localAccessAllowed(
      host,
      suspicious,
      process.env.ACCESS_MODE ?? "local",
      process.env.NODE_ENV === "production",
    )
  )
    return true;
  if (!oauthConfiguration().ready) return false;
  const session = await getServerSession(authOptions);
  return (
    !!session?.user &&
    (session as typeof session & { allowedLogin?: string }).allowedLogin ===
      process.env.GITHUB_ALLOWED_LOGIN?.toLowerCase()
  );
}
export async function requireAccess() {
  if (!(await accessAllowed())) redirect("/login");
}
