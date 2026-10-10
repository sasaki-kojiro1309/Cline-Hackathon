import "server-only";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod/v4";
import { feedbackRecordSchema, reflectionRecordSchema, profileSchema, type Analysis, type FeedbackStatus, type Profile } from "./schemas";
import { dataDirectory, withDatabase, transaction, pruneExpired } from "./sqlite-db";
export { dataDirectory } from "./sqlite-db";

// Only signing-secret creation needs an async queue; SQLite handles data locking.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation);
  queue = result.catch(() => undefined);
  return result;
}
const reflectionRow = z.object({ id: z.string(), session_id: z.string(), reflection_text: z.string(), analysis: z.string(), created_at: z.string() });
const feedbackRow = z.object({ session_id: z.string(), opportunity_id: z.string(), status: z.string(), updated_at: z.string() });
export async function listReflections(sessionId: string, all = false) {
  z.uuid().parse(sessionId);
  return withDatabase((db) => {
    pruneExpired(db);
    const sql = "SELECT * FROM reflections WHERE session_id = ? ORDER BY created_at DESC, id ASC" + (all ? "" : " LIMIT 200");
    return z.array(reflectionRow).parse(db.prepare(sql).all(sessionId)).map((row) => reflectionRecordSchema.parse({
      id: row.id, sessionId: row.session_id, text: row.reflection_text, analysis: JSON.parse(row.analysis), createdAt: row.created_at,
    }));
  });
}
export async function listFeedback(sessionId: string) {
  z.uuid().parse(sessionId);
  return withDatabase((db) => {
    pruneExpired(db);
    return z.array(feedbackRow).parse(db.prepare("SELECT * FROM opportunity_feedback WHERE session_id = ? ORDER BY opportunity_id").all(sessionId))
      .map((row) => feedbackRecordSchema.parse({ sessionId: row.session_id, opportunityId: row.opportunity_id, status: row.status, updatedAt: row.updated_at }));
  });
}
export async function insertReflection(sessionId: string, text: string, analysis: Analysis) {
  const record = reflectionRecordSchema.parse({ id: randomUUID(), sessionId, text, analysis, createdAt: new Date().toISOString() });
  return withDatabase((db) => {
    db.prepare("INSERT INTO reflections(id,session_id,reflection_text,analysis,created_at) VALUES(?,?,?,?,?)")
      .run(record.id, record.sessionId, record.text, JSON.stringify(record.analysis), record.createdAt);
    return record;
  });
}
export async function upsertFeedback(sessionId: string, opportunityId: string, status: FeedbackStatus) {
  const record = feedbackRecordSchema.parse({ sessionId, opportunityId, status, updatedAt: new Date().toISOString() });
  return withDatabase((db) => {
    db.prepare(`INSERT INTO opportunity_feedback(session_id,opportunity_id,status,updated_at) VALUES(?,?,?,?)
      ON CONFLICT(session_id,opportunity_id) DO UPDATE SET status=excluded.status, updated_at=excluded.updated_at`)
      .run(record.sessionId, record.opportunityId, record.status, record.updatedAt);
    return { opportunityId, status };
  });
}
export function sessionSecret(): Promise<string> {
  return serial(async () => {
    if (process.env.SESSION_SIGNING_SECRET) {
      if (Buffer.byteLength(process.env.SESSION_SIGNING_SECRET) < 32) throw new Error("Session secret must be at least 32 bytes.");
      return process.env.SESSION_SIGNING_SECRET;
    }
    if (process.env.STORAGE_PROVIDER === "supabase" || process.env.VERCEL) throw new Error("Cloud storage requires a stable SESSION_SIGNING_SECRET.");
    const path = join(dataDirectory(), "session-secret");
    try { return readFileSync(path, "utf8"); }
    catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      mkdirSync(dataDirectory(), { recursive: true, mode: 0o700 });
      const secret = randomBytes(32).toString("base64url");
      try { writeFileSync(path, secret, { mode: 0o600, flag: "wx" }); }
      catch (writeError) {
        // Separate route bundles may initialize simultaneously on first startup.
        if (writeError instanceof Error && "code" in writeError && writeError.code === "EEXIST") return readFileSync(path, "utf8");
        throw writeError;
      }
      return secret;
    }
  });
}

export async function getProfile(ownerId: string): Promise<Profile> {
  z.uuid().parse(ownerId);
  return withDatabase((db) => {
    const row = z.object({ display_name: z.string(), consent_at: z.string().nullable() }).optional()
      .parse(db.prepare("SELECT display_name,consent_at FROM student_profiles WHERE owner_id = ?").get(ownerId));
    return profileSchema.parse({ displayName: row?.display_name ?? "", consentAt: row?.consent_at ?? null });
  });
}
export async function saveProfile(ownerId: string, profile: Profile) {
  z.uuid().parse(ownerId); const parsed = profileSchema.parse(profile);
  return withDatabase((db) => {
    db.prepare(`INSERT INTO student_profiles(owner_id,display_name,consent_at) VALUES(?,?,?)
      ON CONFLICT(owner_id) DO UPDATE SET display_name=excluded.display_name, consent_at=excluded.consent_at`)
      .run(ownerId, parsed.displayName, parsed.consentAt);
    return parsed;
  });
}
export async function deleteStudentData(ownerId: string) {
  z.uuid().parse(ownerId);
  return withDatabase((db) => transaction(db, () => {
    db.prepare("DELETE FROM reflections WHERE session_id = ?").run(ownerId);
    db.prepare("DELETE FROM opportunity_feedback WHERE session_id = ?").run(ownerId);
    db.prepare("DELETE FROM student_profiles WHERE owner_id = ?").run(ownerId);
    db.prepare("DELETE FROM student_explore_state WHERE owner_id = ?").run(ownerId);
  }));
}