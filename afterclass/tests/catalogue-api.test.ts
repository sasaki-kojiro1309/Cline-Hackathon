import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
import { registerAccount } from "@/lib/accounts";
import { GET as catalogue } from "@/app/api/catalogue/route";
import { GET as recommendations } from "@/app/api/recommendations/route";
import { POST as feedback } from "@/app/api/feedback/route";
import { GET as exportData, POST as deleteData } from "@/app/api/privacy/route";
import { insertReflection } from "@/lib/local-store";
import { withDatabase } from "@/lib/sqlite-db";
import { readLegacyExploreData } from "@/lib/legacy-explore";
import { emptyAnalysis, reflection } from "./fixtures";
let dir: string, owner: string, cookie: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "afterclass-catalogue-"));
  vi.stubEnv("STORAGE_PROVIDER", "local"); vi.stubEnv("AFTERCLASS_DATA_DIR", dir); vi.stubEnv("VERCEL", ""); vi.stubEnv("APP_ORIGIN", ""); vi.stubEnv("DATA_RETENTION_DAYS", "0");
  vi.spyOn(console, "info").mockImplementation(() => {});
  const account = await registerAccount(`sample_${crypto.randomUUID().slice(0, 8)}`, "secure-test-password", ""); owner = account.account.id; cookie = `afterclass_login=${account.token}`;
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("External network must not be called"); }));
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });
function request(path: string, body?: unknown, auth = cookie) {
  return new NextRequest(`http://localhost:3000/api/${path}`, { method: body === undefined ? "GET" : "POST", headers: { cookie: auth, ...(body ? { origin: "http://localhost:3000", "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
describe("static catalogue API and retired data", () => {
  it("requires authentication and validates query filters", async () => {
    expect((await catalogue(request("catalogue", undefined, ""))).status).toBe(401);
    expect((await catalogue(request("catalogue?subject=invented"))).status).toBe(400);
    expect((await catalogue(request("catalogue?page=0"))).status).toBe(400);
  });
  it("browses examples and updates saved recommendations without external requests", async () => {
    const result = await catalogue(request("catalogue?subject=geography"));
    expect(result.headers.get("cache-control")).toBe("no-store");
    const data = await result.json(); expect(data.total).toBe(2); expect(data.catalogueTotal).toBe(100);
    expect(data.activities.every((a: { isExample: boolean; url: string | null }) => a.isExample && a.url === null)).toBe(true);
    await insertReflection(owner, reflection().text, { ...emptyAnalysis, interests: ["geography"] });
    await feedback(request("feedback", { opportunityId: "example-geography-project", status: "saved" }));
    const next = await (await recommendations(request("recommendations"))).json();
    expect(next.saved[0].id).toBe("example-geography-project"); expect(next.recommendations[0].id).toBe("example-geography-inquiry");
    expect((await feedback(request("feedback", { opportunityId: "web-retired-id", status: "saved" }))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("preserves old search rows for export but never displays them or enables automatic jobs", async () => {
    const legacy = { preferences: { autoWeb: true, autoSummary: true }, bundles: [{ resources: [{ id: "web-retired", title: "Old external resource" }] }] };
    withDatabase((db) => db.prepare("INSERT INTO student_explore_state VALUES(?,?)").run(owner, JSON.stringify(legacy)));
    const exported = await (await exportData(request("privacy"))).json(); expect(exported.legacyExplore).toEqual(legacy);
    expect(JSON.stringify(await (await recommendations(request("recommendations"))).json())).not.toContain("web-retired");
    expect((await deleteData(request("privacy", { confirmation: "DELETE" }))).status).toBe(200);
    expect(readLegacyExploreData(owner)).toBeNull(); expect(fetch).not.toHaveBeenCalled();
  });
});