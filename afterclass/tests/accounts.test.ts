import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
import { registerAccount, loginAccount, readLogin, revokeLogin } from "@/lib/accounts";
import { accountInputSchema } from "@/lib/account-schemas";
import { hashPassword, verifyPassword } from "@/lib/passwords";
import { withDatabase } from "@/lib/sqlite-db";
import { GET as accountGet, POST as accountPost } from "@/app/api/account/route";
import { GET as reflectionsGet } from "@/app/api/reflections/route";
import { GET as discoveriesGet } from "@/app/api/discoveries/route";
import { GET as recommendationsGet } from "@/app/api/recommendations/route";
import { GET as privacyGet, POST as privacyPost } from "@/app/api/privacy/route";
import { POST as feedbackPost } from "@/app/api/feedback/route";
import { insertReflection, upsertFeedback } from "@/lib/local-store";
import { reflection, emptyAnalysis } from "./fixtures";
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "afterclass-accounts-"));
  vi.stubEnv("AFTERCLASS_DATA_DIR", dir); vi.stubEnv("STORAGE_PROVIDER", "local"); vi.stubEnv("APP_ORIGIN", ""); vi.stubEnv("DATA_RETENTION_DAYS", "0");
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });
function request(path: string, token?: string, body?: unknown) {
  return new NextRequest(`http://localhost:3000/api/${path}`, { method: body === undefined ? "GET" : "POST", headers: {
    ...(token ? { cookie: `afterclass_login=${token}` } : {}), ...(body ? { origin: "http://localhost:3000", "Content-Type": "application/json" } : {}),
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
describe("required SQLite Login ID/password accounts", () => {
  it("normalizes Login IDs and rejects weak or invalid registration input", () => {
    expect(accountInputSchema.parse({ action: "register", loginId: " Alex_01 ", password: "a-long-safe-password" })).toMatchObject({ loginId: "alex_01" });
    expect(accountInputSchema.safeParse({ action: "register", loginId: "alex", password: "short" }).success).toBe(false);
    expect(accountInputSchema.safeParse({ action: "register", loginId: "bad id", password: "a-long-safe-password" }).success).toBe(false);
  });
  it("salts hashes and verifies passwords without plaintext storage", async () => {
    const a = await hashPassword("secure-test-password"), b = await hashPassword("secure-test-password");
    expect(a).not.toBe(b); expect(a).not.toContain("secure-test-password");
    expect(await verifyPassword("secure-test-password", a)).toBe(true);
    expect(await verifyPassword("wrong-password", a)).toBe(false); expect(await verifyPassword("password", "corrupt")).toBe(false);
  });
  it("creates distinct accounts, rejects duplicate IDs and invalid credentials", async () => {
    const first = await registerAccount("alex", "secure-test-password", "Alex");
    expect(readLogin(first.token)?.id).toBe(first.account.id);
    await expect(registerAccount("alex", "another-safe-password", "")).rejects.toMatchObject({ status: 409 });
    await expect(loginAccount("alex", "wrong-password")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    await expect(loginAccount("unknown", "wrong-password")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    const row = withDatabase((db) => db.prepare("SELECT password_hash FROM student_accounts WHERE login_id='alex'").get());
    expect(row?.password_hash).not.toContain("secure-test-password");
    const sessions = withDatabase((db) => db.prepare("SELECT token_hash FROM login_sessions").all());
    expect(JSON.stringify(sessions)).not.toContain(first.token);
  });
  it("logout revokes tokens; login restores the same account after restart", async () => {
    const registered = await registerAccount("alex", "secure-test-password", "");
    await insertReflection(registered.account.id, reflection().text, emptyAnalysis);
    revokeLogin(registered.token); expect(readLogin(registered.token)).toBeNull();
    vi.resetModules(); const fresh = await import("@/lib/accounts");
    const loggedIn = await fresh.loginAccount("alex", "secure-test-password");
    expect(loggedIn.account.id).toBe(registered.account.id); expect(loggedIn.token).not.toBe(registered.token);
    const history = await (await reflectionsGet(request("reflections", loggedIn.token))).json(); expect(history.reflections).toHaveLength(1);
  });
  it("expired, malformed or forged tokens cannot authenticate", async () => {
    const registered = await registerAccount("alex", "secure-test-password", "");
    withDatabase((db) => db.prepare("UPDATE login_sessions SET expires_at=0").run());
    expect(readLogin(registered.token)).toBeNull(); expect(readLogin("tampered")).toBeNull(); expect(readLogin("x".repeat(43))).toBeNull();
  });
  it("rejects anonymous reads, writes and privacy access at the API", async () => {
    for (const [path, handler] of [["reflections", reflectionsGet], ["discoveries", discoveriesGet], ["recommendations", recommendationsGet], ["privacy", privacyGet]] as const)
      expect((await handler(request(path))).status).toBe(401);
    expect((await feedbackPost(request("feedback", undefined, { opportunityId: "opp-01", status: "saved" }))).status).toBe(401);
    expect((await privacyPost(request("privacy", undefined, { confirmation: "DELETE" }))).status).toBe(401);
    expect((await (await accountGet(request("account"))).json()).authenticated).toBe(false);
  });
  it("keeps two students' history and feedback isolated and ignores client owner IDs", async () => {
    const a = await registerAccount("alex", "secure-test-password", ""), b = await registerAccount("blair", "secure-test-password", "");
    await insertReflection(a.account.id, reflection().text, { ...emptyAnalysis, interests: ["digital systems"] });
    await upsertFeedback(a.account.id, "opp-01", "saved");
    expect((await (await privacyGet(request("privacy", b.token))).json()).reflections).toEqual([]);
    expect((await (await recommendationsGet(request("recommendations", b.token))).json()).saved).toEqual([]);
    expect((await privacyPost(request("privacy", b.token, { confirmation: "DELETE", ownerId: a.account.id }))).status).toBe(400);
    expect((await (await privacyGet(request("privacy", a.token))).json()).reflections).toHaveLength(1);
  });
  it("registration/login/logout API uses HTTP-only cookies without exposing secrets", async () => {
    const response = await accountPost(request("account", undefined, { action: "register", loginId: "Student_A", password: "secure-test-password" }));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ success: true });
    expect(response.headers.get("set-cookie")).toContain("HttpOnly"); expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
    const token = response.cookies.get("afterclass_login")!.value;
    const info = await (await accountGet(request("account", token))).json(); expect(info.loginId).toBe("student_a"); expect(info.retentionDays).toBe(0);
    expect(JSON.stringify(info)).not.toMatch(/password_hash|token_hash|secure-test-password/);
    expect((await accountPost(request("account", token, { action: "sign_out" }))).status).toBe(200);
    expect((await reflectionsGet(request("reflections", token))).status).toBe(401);
  });
  it("long-term default keeps old records until the account deletes them", async () => {
    const account = await registerAccount("alex", "secure-test-password", "");
    const row = await insertReflection(account.account.id, reflection().text, emptyAnalysis);
    withDatabase((db) => db.prepare("UPDATE reflections SET created_at='2020-01-01T00:00:00.000Z' WHERE id=?").run(row.id));
    expect((await (await reflectionsGet(request("reflections", account.token))).json()).reflections).toHaveLength(1);
    await privacyPost(request("privacy", account.token, { confirmation: "DELETE" }));
    expect((await (await reflectionsGet(request("reflections", account.token))).json()).reflections).toEqual([]);
    expect(readLogin(account.token)?.id).toBe(account.account.id);
  });
});