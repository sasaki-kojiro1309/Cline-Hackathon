import "server-only";
import { DatabaseSync } from "node:sqlite";
import { chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod/v4";
import { feedbackRecordSchema, profileSchema, reflectionRecordSchema } from "./schemas";

export function dataDirectory() { return process.env.AFTERCLASS_DATA_DIR || join(process.cwd(), ".afterclass"); }
export function databasePath() { return join(dataDirectory(), "afterclass.sqlite"); }
const legacySchema = z.object({
  reflections: z.array(reflectionRecordSchema), feedback: z.array(feedbackRecordSchema),
  profiles: z.record(z.string(), profileSchema).default({}),
});

export function transaction<T>(db: DatabaseSync, operation: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try { const result = operation(); db.exec("COMMIT"); return result; }
  catch (error) { db.exec("ROLLBACK"); throw error; }
}

function initialize(db: DatabaseSync) {
  db.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA secure_delete = ON;
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS reflections (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL,
      reflection_text TEXT NOT NULL CHECK(length(reflection_text) BETWEEN 20 AND 1500),
      analysis TEXT NOT NULL CHECK(json_valid(analysis)), created_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS reflections_session_created_idx ON reflections(session_id, created_at DESC, id);
    CREATE TABLE IF NOT EXISTS opportunity_feedback (
      session_id TEXT NOT NULL, opportunity_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('saved','not_interested','completed')),
      updated_at TEXT NOT NULL, PRIMARY KEY(session_id, opportunity_id)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS student_profiles (
      owner_id TEXT PRIMARY KEY, display_name TEXT NOT NULL CHECK(length(display_name) <= 60),
      consent_at TEXT
    ) STRICT;
    CREATE TABLE IF NOT EXISTS request_limits (
      key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, hits INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS student_accounts (
      id TEXT PRIMARY KEY, login_id TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, created_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS login_sessions (
      token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES student_accounts(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS login_sessions_account_idx ON login_sessions(account_id);
    CREATE TABLE IF NOT EXISTS student_explore_state (
      owner_id TEXT PRIMARY KEY, state TEXT NOT NULL CHECK(json_valid(state))
    ) STRICT;
  `);
  transaction(db, () => {
    const version = db.prepare("SELECT value FROM metadata WHERE key = 'schema_version'").get();
    if (version && version.value !== "1" && version.value !== "2") throw new Error("Unsupported local database schema version.");
    db.prepare("INSERT INTO metadata(key,value) VALUES('schema_version','2') ON CONFLICT(key) DO UPDATE SET value='2'").run();
    if (db.prepare("SELECT value FROM metadata WHERE key = 'legacy_json_imported'").get()) return;
    const legacyPath = join(dataDirectory(), "store.json");
    if (existsSync(legacyPath)) {
      // Validate before inserting anything. Invalid legacy data rolls back and
      // blocks startup rather than being discarded or overwritten silently.
      const legacy = legacySchema.parse(JSON.parse(readFileSync(legacyPath, "utf8")));
      const insertReflection = db.prepare("INSERT OR IGNORE INTO reflections(id,session_id,reflection_text,analysis,created_at) VALUES(?,?,?,?,?)");
      for (const record of legacy.reflections) insertReflection.run(record.id, record.sessionId, record.text, JSON.stringify(record.analysis), record.createdAt);
      const insertFeedback = db.prepare(`INSERT INTO opportunity_feedback(session_id,opportunity_id,status,updated_at) VALUES(?,?,?,?)
        ON CONFLICT(session_id,opportunity_id) DO UPDATE SET status=excluded.status, updated_at=excluded.updated_at
        WHERE excluded.updated_at > opportunity_feedback.updated_at`);
      for (const record of legacy.feedback) insertFeedback.run(record.sessionId, record.opportunityId, record.status, record.updatedAt);
      const insertProfile = db.prepare("INSERT OR IGNORE INTO student_profiles(owner_id,display_name,consent_at) VALUES(?,?,?)");
      for (const [ownerId, profile] of Object.entries(legacy.profiles)) {
        z.uuid().parse(ownerId);
        insertProfile.run(ownerId, profile.displayName, profile.consentAt);
      }
    }
    // Mark even an empty installation: stale backup files must not resurrect
    // deleted data during a later request or server restart.
    db.prepare("INSERT INTO metadata(key,value) VALUES('legacy_json_imported','1')").run();
  });
}

export function withDatabase<T>(operation: (db: DatabaseSync) => T): T {
  mkdirSync(dataDirectory(), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(databasePath());
  try {
    if (process.platform !== "win32") chmodSync(databasePath(), 0o600);
    initialize(db);
    return operation(db);
  } finally { db.close(); }
}

export function pruneExpired(db: DatabaseSync) {
  const days = Number(process.env.DATA_RETENTION_DAYS || 0);
  if (!Number.isInteger(days) || days < 0 || days > 3650) throw new Error("Invalid DATA_RETENTION_DAYS");
  if (days === 0) return;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  transaction(db, () => {
    db.prepare("DELETE FROM reflections WHERE created_at < ?").run(cutoff);
    db.prepare("DELETE FROM opportunity_feedback WHERE updated_at < ?").run(cutoff);
  });
}