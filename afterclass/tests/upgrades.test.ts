import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { buildDiscoveries } from "@/lib/discoveries";
import { curiosityTags } from "@/lib/analysis";
import { consentInputSchema, opportunitySchema } from "@/lib/schemas";
import { emptyAnalysis, reflection } from "./fixtures";
vi.mock("server-only", () => ({}));
import { consumeLocalLimit } from "@/lib/rate-limit";
import { GET as exportData, POST as deleteData } from "@/app/api/privacy/route";
import { GET as accountGet, POST as accountPost } from "@/app/api/account/route";
import { registerAccount, readLogin } from "@/lib/accounts";
import { insertReflection, listReflections, saveProfile, upsertFeedback } from "@/lib/local-store";
import { storageMode } from "@/lib/supabase";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "afterclass-upgrades-"));
  vi.stubEnv("STORAGE_PROVIDER", "local"); vi.stubEnv("AFTERCLASS_DATA_DIR", directory);
  vi.stubEnv("APP_ORIGIN", ""); vi.stubEnv("SESSION_SIGNING_SECRET", "s".repeat(32));
  vi.stubEnv("DATA_RETENTION_DAYS", "365"); vi.stubEnv("VERCEL", "");
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }); });
function request(path: string, cookie: string, body?: unknown) {
  return new NextRequest(`http://localhost:3000/api/${path}`, { method: body === undefined ? "GET" : "POST",
    headers: { cookie, ...(body !== undefined ? { origin: "http://localhost:3000", "Content-Type": "application/json" } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}
describe("privacy, consent, longitudinal discoveries and cost protection", () => {
  it("requires explicit true consent, never implicit acceptance", () => {
    expect(consentInputSchema.safeParse({ text: reflection().text }).success).toBe(false);
    expect(consentInputSchema.safeParse({ text: reflection().text, consent: false }).success).toBe(false);
    expect(consentInputSchema.safeParse({ text: reflection().text, consent: true }).success).toBe(true);
  });
  it("compares equal reflection windows with real evidence, not ability scores", () => {
    const rows = ["writing", "writing", "digital systems", "digital systems"].map((tag, i) => reflection([tag], {
      id: `550e8400-e29b-41d4-a716-44665544000${i + 1}`, createdAt: `2026-10-${14 - i}T08:00:00.000Z`,
    }));
    const themes = buildDiscoveries(rows).themeChanges;
    expect(themes).toHaveLength(1); expect(themes[0]).toMatchObject({ tag: "writing", recentCount: 2, previousCount: 0 });
    expect(themes[0].sourceReflectionIds).toEqual([rows[0].id, rows[1].id]);
    expect(themes[0].description).toContain("not ability");
    expect(buildDiscoveries(rows.slice(0, 3)).themeChanges).toEqual([]);
  });
  it("maps specific curiosity phrases conservatively without arbitrary skill guesses", () => {
    expect(curiosityTags("how a processor works")).toEqual(["computer architecture"]);
    expect(curiosityTags("building a website")).toEqual(["web development"]);
    expect(curiosityTags("something cool")).toEqual([]);
  });
  it("requires verification metadata for non-example catalogue entries", () => {
    const example = { id: "test", title: "Test", category: "project", description: "Test", relevant_interests: ["design"], required_skills: [], estimated_effort_hours: 1, estimated_effort_label: "1 hour", next_action: "Sketch it", url: null, is_example: false };
    expect(opportunitySchema.safeParse(example).success).toBe(false);
  });
  it("rate limits reject excess requests, then reset after the window", () => {
    expect(consumeLocalLimit("unit-window", 2, 60, 1000)).toBe(true);
    expect(consumeLocalLimit("unit-window", 2, 60, 1001)).toBe(true);
    expect(consumeLocalLimit("unit-window", 2, 60, 1002)).toBe(false);
    expect(consumeLocalLimit("unit-window", 2, 60, 61000)).toBe(true);
  });
  it("cloud deployment refuses ephemeral local persistence", () => {
    vi.stubEnv("VERCEL", "1"); expect(() => storageMode()).toThrow("Cloud deployment requires Supabase");
  });
  it("retention actually removes expired reflection and feedback records", async () => {
    await writeFile(join(directory, "store.json"), JSON.stringify({ reflections: [{ ...reflection(), createdAt: "2020-01-01T00:00:00.000Z" }], feedback: [] }));
    expect(await listReflections(reflection().sessionId, true)).toEqual([]);
  });
  it("export/delete operate only on current owner, including profile and feedback", async () => {
    const registered = await registerAccount("student", "secure-test-password", "");
    const cookie = `afterclass_login=${registered.token}`;
    const owner = readLogin(registered.token)!.id;
    await insertReflection(owner, reflection().text, emptyAnalysis); await insertReflection(reflection().sessionId, reflection().text, emptyAnalysis);
    await saveProfile(owner, { displayName: "Student", consentAt: new Date().toISOString() }); await upsertFeedback(owner, "opp-01", "saved");
    const exported = await (await exportData(request("privacy", cookie))).json();
    expect(exported.reflections).toHaveLength(1); expect(exported.feedback).toHaveLength(1); expect(exported.profile.displayName).toBe("Student");
    expect(JSON.stringify(exported)).not.toContain("sessionId");
    expect((await deleteData(request("privacy", cookie, { confirmation: "no" }))).status).toBe(400);
    expect((await deleteData(request("privacy", cookie, { confirmation: "DELETE" }))).status).toBe(200);
    expect(await listReflections(owner)).toEqual([]); expect(await listReflections(reflection().sessionId)).toHaveLength(1);
    expect((await (await exportData(request("privacy", cookie))).json()).profile.displayName).toBe("");
  });
  it("account status is public but profile/data require password login", async () => {
    const info = await (await accountGet(request("account", ""))).json(); expect(info.authenticated).toBe(false);
    expect((await accountPost(request("account", "", { action: "profile", displayName: "Guest" }))).status).toBe(401);
    const logout = await accountPost(request("account", "", { action: "sign_out" }));
    expect(logout.status).toBe(200); expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
