import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession, type NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import { localAccessAllowed } from "@flownix/core";
const configured = () =>
  !!(
    process.env.GITHUB_CLIENT_ID &&
    process.env.GITHUB_CLIENT_SECRET &&
    process.env.NEXTAUTH_SECRET &&
    process.env.GITHUB_ALLOWED_LOGIN
  );
export const authOptions: NextAuthOptions = {
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
      return (
        configured() &&
        process.env.ACCESS_MODE === "oauth" &&
        p?.login?.toLowerCase() ===
          process.env.GITHUB_ALLOWED_LOGIN?.toLowerCase()
      );
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
  if (process.env.ACCESS_MODE !== "oauth" || !configured()) return false;
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
