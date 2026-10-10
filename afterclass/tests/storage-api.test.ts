import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NextRequest } from "next/server";
import { reflection, emptyAnalysis } from "./fixtures";

vi.mock("server-only", () => ({}));
const analyze = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai", () => ({ analyzeReflection: analyze }));
import { insertReflection, listFeedback, listReflections, sessionSecret, upsertFeedback } from "@/lib/local-store";
import { POST as accountPost } from "@/app/api/account/route";
import { GET as reflectionsGet, POST as reflectionsPost } from "@/app/api/reflections/route";
import { POST as feedbackPost } from "@/app/api/feedback/route";
import { GET as discoveriesGet } from "@/app/api/discoveries/route";
import { GET as recommendationsGet } from "@/app/api/recommendations/route";
import { ApiError } from "@/lib/api";
import { DatabaseSync } from "node:sqlite";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "afterclass-test-"));
  vi.stubEnv("AFTERCLASS_DATA_DIR", dir); vi.stubEnv("SESSION_SIGNING_SECRET", "");
  vi.stubEnv("STORAGE_PROVIDER", "local"); vi.stubEnv("APP_ORIGIN", "");
  analyze.mockReset(); analyze.mockResolvedValue(emptyAnalysis);
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });
function request(path: string, cookie?: string, body?: unknown, origin = "http://localhost:3000") {
  return new NextRequest(`http://localhost:3000/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "Content-Type": "application/json", origin } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function newCookie() {
  const response = await accountPost(request("account", undefined, { action: "register", loginId: `student_${crypto.randomUUID().slice(0,8)}`, password: "secure-test-password" }));
  expect(response.status).toBe(200);
  return `afterclass_login=${response.cookies.get("afterclass_login")!.value}`;
}
describe("real local persistence and API (AI mocked only)", () => {
  it("persists and filters reflections by session, including fresh module reads", async () => {
    const record = await insertReflection(reflection().sessionId, reflection().text, emptyAnalysis);
    expect((await listReflections(reflection().sessionId))[0].id).toBe(record.id);
    expect(await listReflections("550e8400-e29b-41d4-a716-446655440099")).toEqual([]);
    const db = new DatabaseSync(join(dir, "afterclass.sqlite"));
    try { expect(db.prepare("SELECT reflection_text FROM reflections WHERE id = ?").get(record.id)?.reflection_text).toBe(reflection().text); }
    finally { db.close(); }
    vi.resetModules();
    const freshStore = await import("@/lib/local-store");
    expect((await freshStore.listReflections(reflection().sessionId))[0].id).toBe(record.id);
  });
  it("serializes concurrent writes and makes feedback idempotent", async () => {
    await Promise.all(Array.from({ length: 8 }, () => insertReflection(reflection().sessionId, reflection().text, emptyAnalysis)));
    expect(await listReflections(reflection().sessionId)).toHaveLength(8);
    await Promise.all([upsertFeedback(reflection().sessionId, "opp-01", "saved"), upsertFeedback(reflection().sessionId, "opp-01", "saved")]);
    expect(await listFeedback(reflection().sessionId)).toHaveLength(1);
    await upsertFeedback(reflection().sessionId, "opp-01", "completed");
    expect((await listFeedback(reflection().sessionId))[0].status).toBe("completed");
  });
  it("keeps the locally generated signing secret stable", async () => {
    const secret = await sessionSecret(); expect(secret.length).toBeGreaterThanOrEqual(32);
    expect(await sessionSecret()).toBe(secret);
  });
  it("rejects corrupted data rather than overwriting it", async () => {
    await writeFile(join(dir, "store.json"), "broken");
    await expect(listReflections(reflection().sessionId)).rejects.toThrow();
  });
  it("imports legacy JSON once, preserves feedback/profile and never resurrects deleted data", async () => {
    const legacy = { reflections: [reflection()], feedback: [{ sessionId: reflection().sessionId, opportunityId: "opp-01", status: "saved", updatedAt: new Date().toISOString() }], profiles: { [reflection().sessionId]: { displayName: "Student", consentAt: null } } };
    await writeFile(join(dir, "store.json"), JSON.stringify(legacy));
    expect(await listReflections(reflection().sessionId)).toHaveLength(1);
    expect((await listFeedback(reflection().sessionId))[0].status).toBe("saved");
    const local = await import("@/lib/local-store");
    expect((await local.getProfile(reflection().sessionId)).displayName).toBe("Student");
    await local.deleteStudentData(reflection().sessionId);
    vi.resetModules(); const restarted = await import("@/lib/local-store");
    expect(await restarted.listReflections(reflection().sessionId)).toEqual([]);
    expect(await readFile(join(dir, "store.json"), "utf8")).toBe(JSON.stringify(legacy));
  });
  it("rejects a corrupt SQLite file without resetting it", async () => {
    await writeFile(join(dir, "afterclass.sqlite"), "not a database");
    await expect(listReflections(reflection().sessionId)).rejects.toThrow();
    expect(await readFile(join(dir, "afterclass.sqlite"), "utf8")).toBe("not a database");
  });
  it("POST persists validated AI analysis and GET hides server session identity", async () => {
    const cookie = await newCookie();
    const response = await reflectionsPost(request("reflections", cookie, { text: reflection().text, consent: true }));
    expect(response.status).toBe(201); expect(analyze).toHaveBeenCalledWith(reflection().text);
    const body = await response.json(); expect(body.reflection.text).toBe(reflection().text);
    const get = await reflectionsGet(request("reflections", cookie));
    expect(get.headers.get("cache-control")).toBe("no-store");
    expect((await get.json()).reflections).toHaveLength(1);
    const discovery = await discoveriesGet(request("discoveries", cookie));
    expect(JSON.stringify(await discovery.json())).not.toContain("sessionId");
  });
  it("separate browsers and tampered cookies cannot read another session", async () => {
    const a = await newCookie(), b = await newCookie(); expect(a).not.toBe(b);
    await reflectionsPost(request("reflections", a, { text: reflection().text, consent: true }));
    expect((await (await reflectionsGet(request("reflections", b))).json()).reflections).toEqual([]);
    const tampered = a.slice(0, -1) + (a.endsWith("A") ? "B" : "A");
    expect((await reflectionsGet(request("reflections", tampered))).status).toBe(401);
  });
  it("failed AI extraction saves nothing", async () => {
    const cookie = await newCookie(); analyze.mockRejectedValueOnce(new ApiError(503, "AI_UNAVAILABLE", "Insights are temporarily unavailable."));
    expect((await reflectionsPost(request("reflections", cookie, { text: reflection().text, consent: true }))).status).toBe(503);
    expect((await (await reflectionsGet(request("reflections", cookie))).json()).reflections).toEqual([]);
  });
  it("rejects cross-origin, malformed JSON, bad input and unknown catalogue IDs", async () => {
    const cookie = await newCookie();
    expect((await reflectionsPost(request("reflections", cookie, { text: reflection().text, consent: true }, "https://evil.example"))).status).toBe(403);
    expect((await reflectionsPost(request("reflections", cookie, { text: "short" }))).status).toBe(400);
    const malformed = new NextRequest("http://localhost:3000/api/reflections", { method: "POST", headers: { cookie, origin: "http://localhost:3000", "Content-Type": "application/json" }, body: "{" });
    expect((await reflectionsPost(malformed)).status).toBe(400);
    expect((await feedbackPost(request("feedback", cookie, { opportunityId: "invented", status: "saved" }))).status).toBe(400);
    expect((await feedbackPost(request("feedback", cookie, { opportunityId: "opp-01", status: "saved" }))).status).toBe(200);
  });
  it("real feedback persists, reranks, survives fresh reads and remains session-isolated", async () => {
    const a = await newCookie(), b = await newCookie();
    analyze.mockResolvedValue({ ...emptyAnalysis, interests: ["digital systems", "computer architecture"] });
    await reflectionsPost(request("reflections", a, { text: reflection().text, consent: true }));
    async function recommendations(cookie: string) { return (await recommendationsGet(request("recommendations", cookie))).json(); }
    expect((await recommendations(a)).recommendations.map((r: { id: string }) => r.id)).toEqual(["opp-17", "resource-03", "opp-09"]);
    await feedbackPost(request("feedback", a, { opportunityId: "opp-01", status: "not_interested" }));
    expect((await recommendations(a)).recommendations.every((r: { id: string }) => r.id !== "opp-01")).toBe(true);
    await feedbackPost(request("feedback", a, { opportunityId: "resource-03", status: "saved" }));
    expect((await recommendations(a)).saved.map((r: { id: string }) => r.id)).toEqual(["resource-03"]);
    expect((await recommendations(b)).saved).toEqual([]);
    await feedbackPost(request("feedback", a, { opportunityId: "resource-03", status: "completed" }));
    expect((await recommendations(a)).saved).toEqual([]);
    expect((await recommendations(a)).recommendations.every((r: { id: string }) => !["opp-01", "resource-03"].includes(r.id))).toBe(true);
  });
});