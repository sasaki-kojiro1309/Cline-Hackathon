import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { reflection, emptyAnalysis } from "./fixtures";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), getUser: vi.fn(), refreshSession: vi.fn(), signInWithOtp: vi.fn(), verifyOtp: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  storageMode: () => "supabase", authEnabled: () => true,
  adminClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
  authClient: () => ({ auth: { getUser: mocks.getUser, refreshSession: mocks.refreshSession, signInWithOtp: mocks.signInWithOtp, verifyOtp: mocks.verifyOtp } }),
}));
import { listReflections, insertReflection, upsertFeedback, deleteStudentData, claimAnonymousData } from "@/lib/storage";
type Chain = Record<string, ReturnType<typeof vi.fn>>;
let chain: Chain;
beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  vi.stubEnv("SESSION_SIGNING_SECRET", "s".repeat(32)); vi.stubEnv("APP_ORIGIN", "");
  vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {});
  chain = {};
  for (const method of ["select", "delete", "insert", "eq", "lt", "order", "range", "single", "upsert"]) chain[method] = vi.fn().mockReturnValue(chain);
  mocks.from.mockReturnValue(chain);
  mocks.rpc.mockResolvedValue({ data: true, error: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("Supabase storage and auth contracts (network mocked, not a live migration test)", () => {
  it("database reflection queries and pruning are owner-scoped", async () => {
    chain.lt.mockResolvedValue({ error: null });
    chain.range.mockResolvedValue({ data: [{ id: reflection().id, session_id: reflection().sessionId, reflection_text: reflection().text, analysis: emptyAnalysis, created_at: reflection().createdAt }], error: null });
    expect((await listReflections(reflection().sessionId))[0].text).toBe(reflection().text);
    expect(chain.eq).toHaveBeenCalledWith("session_id", reflection().sessionId);
    expect(chain.range).toHaveBeenCalledWith(0, 199);
  });
  it("reflection insertion assigns server owner and propagates DB errors", async () => {
    chain.single.mockResolvedValue({ data: { id: reflection().id, session_id: reflection().sessionId, reflection_text: reflection().text, analysis: emptyAnalysis, created_at: reflection().createdAt }, error: null });
    await insertReflection(reflection().sessionId, reflection().text, emptyAnalysis);
    expect(chain.insert).toHaveBeenCalledWith({ session_id: reflection().sessionId, reflection_text: reflection().text, analysis: emptyAnalysis });
    chain.single.mockResolvedValue({ data: null, error: { code: "DB_ERROR" } });
    await expect(insertReflection(reflection().sessionId, reflection().text, emptyAnalysis)).rejects.toMatchObject({ code: "DATABASE_UNAVAILABLE" });
  });
  it("feedback upserts use owner/ID conflict and deletes/claims use atomic RPCs", async () => {
    chain.upsert.mockResolvedValue({ error: null });
    await upsertFeedback("owner", "opp-01", "saved"); expect(chain.upsert).toHaveBeenCalledWith(expect.objectContaining({ session_id: "owner", opportunity_id: "opp-01", status: "saved" }), { onConflict: "session_id,opportunity_id" });
    await deleteStudentData("owner"); expect(mocks.rpc).toHaveBeenCalledWith("delete_student_data", { p_owner: "owner" });
    await claimAnonymousData("anonymous", "user"); expect(mocks.rpc).toHaveBeenCalledWith("claim_anonymous_data", { p_anonymous: "anonymous", p_user: "user" });
  });
});
