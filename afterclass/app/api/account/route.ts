import { ApiError, endpoint, jsonBody } from "@/lib/api";
import { getProfile, saveProfile, retentionDays } from "@/lib/storage";
import { enforceLimit } from "@/lib/rate-limit";
import { accountInputSchema } from "@/lib/account-schemas";
import { registerAccount, loginAccount, revokeLogin, LOGIN_COOKIE } from "@/lib/accounts";

export const runtime = "nodejs";
export const GET = endpoint(async (_request, ownerId, identity) => ({
  authenticated: identity.authenticated, loginId: identity.loginId, storage: "local",
  profile: identity.authenticated ? await getProfile(ownerId) : { displayName: "", consentAt: null }, retentionDays: retentionDays(),
}), 200, { skipAuth: true });
export const POST = endpoint(async (request, ownerId, identity) => {
  const input = await jsonBody(request, accountInputSchema);
  const previousToken = request.cookies.get(LOGIN_COOKIE)?.value;
  if (input.action === "sign_out") {
    revokeLogin(previousToken);
    identity.clearAuth = true;
    return { success: true };
  }
  if (input.action === "profile") {
    if (!identity.authenticated) throw new ApiError(401, "SIGN_IN_REQUIRED", "Log in before editing your profile.");
    await saveProfile(ownerId, { ...await getProfile(ownerId), displayName: input.displayName });
    return { success: true };
  }
  if (identity.authenticated) throw new ApiError(409, "ALREADY_SIGNED_IN", "Log out before signing into a different account.");
  await enforceLimit(`login:${input.loginId}`, 10, 600);
  await enforceLimit("login:server", 60, 600);
  const result = input.action === "register"
    ? await registerAccount(input.loginId, input.password, input.displayName, previousToken)
    : await loginAccount(input.loginId, input.password, previousToken);
  identity.loginToken = result.token;
  return { success: true };
}, 200, { skipAuth: true });