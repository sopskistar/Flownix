import { describe, it, expect } from "vitest";
import { oauthConfiguration, githubLoginAllowed } from "../src/index";
const production = {
  NODE_ENV: "production",
  ACCESS_MODE: "oauth",
  GITHUB_CLIENT_ID: "test-client",
  GITHUB_CLIENT_SECRET: "synthetic-provider-secret-not-real",
  NEXTAUTH_SECRET: "synthetic-session-secret-for-tests-only-32",
  GITHUB_ALLOWED_LOGIN: "sopskistar",
  NEXTAUTH_URL: "https://flownix.example.test",
};
describe("Production GitHub OAuth policy", () => {
  it("requires complete configuration and canonical HTTPS origin", () => {
    expect(oauthConfiguration(production)).toMatchObject({
      ready: true,
      origin: production.NEXTAUTH_URL,
      callbackUrl: "https://flownix.example.test/api/auth/callback/github",
    });
    expect(
      oauthConfiguration({
        ...production,
        NEXTAUTH_URL: production.NEXTAUTH_URL + "/",
      }).origin,
    ).toBe(production.NEXTAUTH_URL);
  });
  it.each([
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
    "NEXTAUTH_SECRET",
    "GITHUB_ALLOWED_LOGIN",
    "NEXTAUTH_URL",
  ])("fails closed when %s is absent", (key) => {
    expect(oauthConfiguration({ ...production, [key]: "" }).ready).toBe(false);
  });
  it.each([
    "http://flownix.example.test",
    "http://127.0.0.1:3000",
    "https://flownix.example.test/callback",
    "https://user:pass@flownix.example.test",
    "invalid",
  ])("rejects invalid production origins: %s", (url) => {
    expect(oauthConfiguration({ ...production, NEXTAUTH_URL: url }).ready).toBe(
      false,
    );
  });
  it("allows only the exact configured GitHub identity", () => {
    expect(githubLoginAllowed("sopskistar", production)).toBe(true);
    expect(githubLoginAllowed("Sopskistar", production)).toBe(true);
    for (const login of [
      "another-user",
      "sopskistar-extra",
      null,
      undefined,
      {},
    ])
      expect(githubLoginAllowed(login, production)).toBe(false);
  });
  it("rejects short secrets, registration lists and local production mode", () => {
    expect(
      oauthConfiguration({ ...production, NEXTAUTH_SECRET: "short" }).ready,
    ).toBe(false);
    expect(
      oauthConfiguration({
        ...production,
        GITHUB_ALLOWED_LOGIN: "sopskistar,other",
      }).ready,
    ).toBe(false);
    expect(
      githubLoginAllowed("sopskistar", { ...production, ACCESS_MODE: "local" }),
    ).toBe(false);
  });
});
