import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { NextRequest } from "next/server";
import { emptyAnalysis, reflection } from "./fixtures";
vi.mock("server-only", () => ({}));
const analyze = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai", () => ({ analyzeStructured: analyze }));
import { registerAccount } from "@/lib/accounts";
import { insertReflection, listReflections, deleteStudentData } from "@/lib/local-store";
import { GET as getSummary, POST as createSummary } from "@/app/api/journey/route";
import { GET as discoveries } from "@/app/api/discoveries/route";
import { GET as history } from "@/app/api/reflections/route";
import { clearJourneyCache, journeyFingerprint, readJourneyCache, saveJourneyCache } from "@/lib/journey-cache";
import { ApiError } from "@/lib/api";

let dir: string, owner: string, cookie: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "afterclass-journey-"));
  vi.stubEnv("STORAGE_PROVIDER", "local"); vi.stubEnv("AFTERCLASS_DATA_DIR", dir); vi.stubEnv("DATA_RETENTION_DAYS", "0"); vi.stubEnv("VERCEL", ""); vi.stubEnv("APP_ORIGIN", ""); vi.stubEnv("AI_PROVIDER", "openai");
  vi.spyOn(console, "info").mockImplementation(() => {}); analyze.mockReset();
  const account = await registerAccount(`student_${crypto.randomUUID().slice(0, 8)}`, "secure-test-password", "");
  owner = account.account.id; cookie = `afterclass_login=${account.token}`;
});
afterEach(async () => { clearJourneyCache(owner); vi.restoreAllMocks(); vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });
function request(path = "journey", body?: unknown, auth = cookie) {
  return new NextRequest(`http://localhost:3000/api/${path}`, { method: body === undefined ? "GET" : "POST", headers: { cookie: auth, ...(body ? { origin: "http://localhost:3000", "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
const body = { selection: { range: "all" }, consent: true };
async function seed() {
  const first = await insertReflection(owner, reflection().text, { ...emptyAnalysis, interests: ["programming"] });
  await insertReflection(owner, "I enjoyed programming and problem solving today.", { ...emptyAnalysis, interests: ["programming"] });
  const db = new DatabaseSync(join(dir, "afterclass.sqlite"));
  try { db.prepare("UPDATE reflections SET created_at = ? WHERE id = ?").run(new Date(Date.now() - 86400000).toISOString(), first.id); }
  finally { db.close(); }
  analyze.mockImplementation(async (_system: string, user: string) => {
    const payload = JSON.parse(user.slice(user.indexOf("\n") + 1));
    return { overview: { text: "You may enjoy programming across your experiences.", sourceReflectionIds: [payload.evidence[0].id] }, patterns: [], nextSteps: [] };
  });
}
describe("journey API, privacy and cache", () => {
  it("requires authentication, valid ranges and explicit summary consent", async () => {
    expect((await getSummary(request("journey", undefined, ""))).status).toBe(401);
    expect((await getSummary(request("journey?range=custom"))).status).toBe(400);
    expect((await createSummary(request("journey", { selection: { range: "all" } }))).status).toBe(400);
    expect((await createSummary(request("journey", body))).status).toBe(400);
    expect(analyze).not.toHaveBeenCalled();
  });
  it("generates on demand, reuses unchanged summaries, and marks new data stale", async () => {
    await seed();
    const response = await createSummary(request("journey", body)); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "fresh", cached: false, reflectionCount: 2 });
    expect((await (await createSummary(request("journey", body))).json()).cached).toBe(true);
    expect(analyze).toHaveBeenCalledTimes(1);
    await insertReflection(owner, reflection().text, emptyAnalysis);
    expect(await (await getSummary(request())).json()).toMatchObject({ status: "stale", summary: null });
    expect((await createSummary(request("journey", body))).status).toBe(200); expect(analyze).toHaveBeenCalledTimes(2);
  });
  it("invalidates configuration changes, expires cached data, and isolates owners", async () => {
    await seed(); await createSummary(request("journey", body));
    vi.stubEnv("AI_MODEL", "different-model");
    expect((await (await getSummary(request())).json()).status).toBe("stale");
    const rows = await listReflections(owner, true);
    expect(readJourneyCache(reflection().sessionId, { range: "all" }, rows)).toBeNull();
    const entry = readJourneyCache(owner, { range: "all" }, rows)!;
    expect(journeyFingerprint(rows, {})).not.toBe(entry.fingerprint);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 3600001);
    expect(readJourneyCache(owner, { range: "all" }, rows)).toBeNull();
  });
  it("never serves derived data after source deletion, even without explicit cache clearing", async () => {
    await seed(); await createSummary(request("journey", body)); await deleteStudentData(owner);
    expect(await (await getSummary(request())).json()).toMatchObject({ status: "none", summary: null, reflectionCount: 0 });
  });
  it("invalidates summary evidence when retention removes any original source", async () => {
    await seed(); await createSummary(request("journey", body));
    const db = new DatabaseSync(join(dir, "afterclass.sqlite"));
    try { db.prepare("UPDATE reflections SET created_at = '2020-01-01T00:00:00.000Z' WHERE id = (SELECT id FROM reflections LIMIT 1)").run(); } finally { db.close(); }
    vi.stubEnv("DATA_RETENTION_DAYS", "1");
    expect((await (await getSummary(request())).json()).status).toBe("none");
  });
  it("bounds paid regenerations and does not charge cached reuse to the AI limit", async () => {
    await seed();
    expect((await createSummary(request("journey", body))).status).toBe(200);
    expect((await createSummary(request("journey", body))).status).toBe(200);
    expect((await createSummary(request("journey", { ...body, refresh: true }))).status).toBe(200);
    expect((await createSummary(request("journey", { ...body, refresh: true }))).status).toBe(200);
    const limited = await createSummary(request("journey", { ...body, refresh: true }));
    expect(limited.status).toBe(429); expect(limited.headers.get("retry-after")).toBe("60");
    expect(analyze).toHaveBeenCalledTimes(3);
  });
  it("rejects fabricated citations and preserves daily data on AI failure", async () => {
    await seed(); analyze.mockResolvedValue({ overview: { text: "invented", sourceReflectionIds: ["not-real"] }, patterns: [], nextSteps: [] });
    expect((await createSummary(request("journey", body))).status).toBe(502);
    expect((await (await getSummary(request())).json()).status).toBe("none");
    analyze.mockRejectedValue(new ApiError(503, "AI_QUOTA_EXCEEDED", "No API credits. Your draft is unchanged."));
    expect((await createSummary(request("journey", body))).status).toBe(503);
    expect(await listReflections(owner)).toHaveLength(2);
  });
  it("does not publish a summary if data is deleted while the request is running", async () => {
    await seed(); const original = analyze.getMockImplementation()!;
    analyze.mockImplementation(async (...args) => { const output = await original(...args); await deleteStudentData(owner); return output; });
    expect((await createSummary(request("journey", body))).status).toBe(409);
    expect(readJourneyCache(owner, { range: "all" }, [])).toBeNull();
  });
  it("uses more than 200 persisted rows and paginates history in the real API", async () => {
    const db = new DatabaseSync(join(dir, "afterclass.sqlite"));
    try {
      const insert = db.prepare("INSERT INTO reflections VALUES(?,?,?,?,?)");
      for (let i = 0; i < 205; i++) insert.run(crypto.randomUUID(), owner, reflection().text, JSON.stringify(emptyAnalysis), new Date().toISOString());
      insert.run(crypto.randomUUID(), reflection().sessionId, reflection().text, JSON.stringify(emptyAnalysis), new Date().toISOString());
    } finally { db.close(); }
    expect((await (await discoveries(request("discoveries"))).json()).reflectionCount).toBe(205);
    const result = await (await history(request("reflections?page=11"))).json();
    expect(result.total).toBe(205); expect(result.reflections).toHaveLength(5);
    expect(JSON.stringify(result)).not.toContain("sessionId");
  });
  it("clears cache only for the selected owner", async () => {
    const summary = { overview: { text: "Possible interest", sourceReflectionIds: [reflection().id] }, patterns: [], nextSteps: [] };
    const entry = { summary, fingerprint: "fingerprint", generatedAt: new Date().toISOString(), sourceIds: [reflection().id], evidenceCount: 1, providerLabel: "OpenAI" };
    saveJourneyCache(owner, { range: "all" }, entry); saveJourneyCache(reflection().sessionId, { range: "all" }, entry);
    clearJourneyCache(owner);
    expect(readJourneyCache(owner, { range: "all" }, [reflection()])).toBeNull();
    expect(readJourneyCache(reflection().sessionId, { range: "all" }, [reflection()])).not.toBeNull();
    clearJourneyCache(reflection().sessionId);
  });
});