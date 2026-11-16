import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { oauthConfiguration } from "@flownix/core";
import { authOptions } from "../../../../lib/auth";
const authenticate = NextAuth(authOptions);
type Context = { params: Promise<{ nextauth: string[] }> };
function handler(request: NextRequest, context: Context) {
  if (!oauthConfiguration().ready)
    return Response.json(
      { error: "AUTH_NOT_CONFIGURED" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  return authenticate(request, context);
}
export { handler as GET, handler as POST };
