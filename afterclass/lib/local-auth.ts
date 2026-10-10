import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import { LOGIN_COOKIE, readLogin, SESSION_SECONDS } from "./accounts";
import { ApiError } from "./errors";

export type Identity = { ownerId: string; loginId: string | null; authenticated: boolean; loginToken?: string; clearAuth?: boolean };
export async function resolveIdentity(request: NextRequest, required = true): Promise<Identity> {
  const account = readLogin(request.cookies.get(LOGIN_COOKIE)?.value);
  if (!account && required) throw new ApiError(401, "SIGN_IN_REQUIRED", "Please log in or create an account to continue.");
  return { ownerId: account?.id ?? "", loginId: account?.loginId ?? null, authenticated: !!account };
}
export function applyAuthCookies(response: NextResponse, identity: Identity) {
  const options = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };
  if (identity.clearAuth) response.cookies.set(LOGIN_COOKIE, "", { ...options, maxAge: 0 });
  else if (identity.loginToken) response.cookies.set(LOGIN_COOKIE, identity.loginToken, { ...options, maxAge: SESSION_SECONDS });
  // Old anonymous/cloud cookies cannot authenticate or claim student data.
  for (const name of ["afterclass_session", "afterclass_access", "afterclass_refresh"]) response.cookies.set(name, "", { ...options, maxAge: 0 });
}