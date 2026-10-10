import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { reflection, emptyAnalysis } from "./fixtures";
vi.mock("server-only", () => ({}));
import { withDatabase, databasePath, transaction } from "@/lib/sqlite-db";
import { insertReflection, listReflections, deleteStudentData } from "@/lib/local-store";
import { consumeLocalLimit } from "@/lib/rate-limit";
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "afterclass-sqlite-"));
  vi.stubEnv("AFTERCLASS_DATA_DIR", directory); vi.stubEnv("DATA_RETENTION_DAYS", "365");
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }); });
describe("real SQLite database", () => {
  it("creates SQL tables, WAL and a versioned schema without external setup", () => {
    withDatabase((db) => {
      expect(db.prepare("PRAGMA journal_mode").get()?.journal_mode).toBe("wal");
      expect(db.prepare("SELECT value FROM metadata WHERE key='schema_version'").get()?.value).toBe("2");
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).toHaveLength(8);
    });
  });
  it("uses bound parameters for student text including SQL-looking input", async () => {
    const text = "I enjoyed writing today. '); DROP TABLE reflections; --";
    await insertReflection(reflection().sessionId, text, emptyAnalysis);
    expect((await listReflections(reflection().sessionId))[0].text).toBe(text);
  });
  it("rolls back failed transactions without half-written data", () => {
    expect(() => withDatabase((db) => transaction(db, () => {
      db.prepare("INSERT INTO student_profiles VALUES(?,?,?)").run(reflection().sessionId, "Student", null);
      throw new Error("failed write");
    }))).toThrow("failed write");
    expect(withDatabase((db) => db.prepare("SELECT * FROM student_profiles").all())).toEqual([]);
  });
  it("failed JSON imports roll back all legacy rows and can be retried after repair", async () => {
    const invalid = { reflections: [reflection()], feedback: [], profiles: { "bad-owner": { displayName: "Student", consentAt: null } } };
    await writeFile(join(directory, "store.json"), JSON.stringify(invalid));
    await expect(listReflections(reflection().sessionId)).rejects.toThrow();
    const raw = new DatabaseSync(databasePath());
    try { expect(raw.prepare("SELECT * FROM reflections").all()).toEqual([]); }
    finally { raw.close(); }
    await writeFile(join(directory, "store.json"), JSON.stringify({ reflections: [reflection()], feedback: [] }));
    expect(await listReflections(reflection().sessionId)).toHaveLength(1);
  });
  it("does not import stale JSON added after SQLite was initialized", async () => {
    await insertReflection(reflection().sessionId, reflection().text, emptyAnalysis);
    await deleteStudentData(reflection().sessionId);
    await writeFile(join(directory, "store.json"), JSON.stringify({ reflections: [reflection()], feedback: [] }));
    expect(await listReflections(reflection().sessionId)).toEqual([]);
  });
  it("rate limits survive a fresh module load and database connections", async () => {
    expect(consumeLocalLimit("persistent-key", 1, 60)).toBe(true);
    vi.resetModules();
    const fresh = await import("@/lib/rate-limit");
    expect(fresh.consumeLocalLimit("persistent-key", 1, 60)).toBe(false);
  });
  it("independent Node processes write safely into the same database", async () => {
    withDatabase(() => undefined);
    const script = `const {DatabaseSync}=require('node:sqlite'); const d=new DatabaseSync(process.argv[1]); d.exec('PRAGMA busy_timeout=5000'); for(let i=0;i<10;i++) d.prepare('INSERT INTO reflections VALUES(?,?,?,?,?)').run(require('node:crypto').randomUUID(),process.argv[2],process.argv[3],process.argv[4],new Date().toISOString()); d.close();`;
    const run = promisify(execFile);
    await Promise.all(Array.from({ length: 3 }, () => run(process.execPath, ["-e", script, databasePath(), reflection().sessionId, reflection().text, JSON.stringify(emptyAnalysis)])));
    expect(await listReflections(reflection().sessionId)).toHaveLength(30);
    expect((await readFile(databasePath())).subarray(0, 15).toString()).toBe("SQLite format 3");
  });
});