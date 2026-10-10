import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod/v4";
import { withDatabase, transaction } from "./sqlite-db";
import { hashPassword, verifyPassword } from "./passwords";
import { ApiError } from "./errors";
import { storageMode } from "./supabase";
import { loginIdSchema } from "./account-schemas";

export const LOGIN_COOKIE = "afterclass_login";
export const SESSION_SECONDS = 30 * 86400;
export function requireLocalAccounts() {
  if (storageMode() !== "local") throw new ApiError(503, "LOCAL_ACCOUNTS_REQUIRED", "Password accounts currently require STORAGE_PROVIDER=local (SQLite). No cloud account fallback is enabled.");
}
function tokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }
const accountRow = z.object({ id: z.uuid(), login_id: z.string(), password_hash: z.string() });
export type Account = { id: string; loginId: string };
export function readLogin(token: string | undefined): Account | null {
  requireLocalAccounts();
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return withDatabase((db) => {
    db.prepare("DELETE FROM login_sessions WHERE expires_at <= ?").run(Date.now());
    const row = z.object({ id: z.uuid(), login_id: z.string() }).optional().parse(db.prepare(`
      SELECT a.id,a.login_id FROM login_sessions s JOIN student_accounts a ON a.id=s.account_id
      WHERE s.token_hash=? AND s.expires_at>?`).get(tokenHash(token), Date.now()));
    return row ? { id: row.id, loginId: row.login_id } : null;
  });
}
export function revokeLogin(token: string | undefined) {
  requireLocalAccounts();
  if (token) withDatabase((db) => db.prepare("DELETE FROM login_sessions WHERE token_hash=?").run(tokenHash(token)));
}
function newSession(db: import("node:sqlite").DatabaseSync, accountId: string, previousToken?: string) {
  if (previousToken) db.prepare("DELETE FROM login_sessions WHERE token_hash=?").run(tokenHash(previousToken));
  db.prepare("DELETE FROM login_sessions WHERE expires_at<=?").run(Date.now());
  const token = randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO login_sessions(token_hash,account_id,expires_at,created_at) VALUES(?,?,?,?)")
    .run(tokenHash(token), accountId, Date.now() + SESSION_SECONDS * 1000, Date.now());
  return token;
}
export async function registerAccount(loginId: string, password: string, displayName: string, previousToken?: string) {
  requireLocalAccounts();
  loginId = loginIdSchema.parse(loginId);
  z.string().min(12).max(128).parse(password);
  displayName = z.string().trim().max(60).parse(displayName);
  const encoded = await hashPassword(password);
  return withDatabase((db) => transaction(db, () => {
    if (db.prepare("SELECT id FROM student_accounts WHERE login_id=?").get(loginId)) throw new ApiError(409, "LOGIN_ID_TAKEN", "That Login ID is already in use. Choose another or log in.");
    const id = randomUUID();
    db.prepare("INSERT INTO student_accounts(id,login_id,password_hash,created_at) VALUES(?,?,?,?)").run(id, loginId, encoded, new Date().toISOString());
    db.prepare("INSERT INTO student_profiles(owner_id,display_name,consent_at) VALUES(?,?,NULL)").run(id, displayName);
    return { account: { id, loginId }, token: newSession(db, id, previousToken) };
  }));
}
// Unknown IDs still run scrypt to reduce username discovery via response timing.
let dummyHash: Promise<string> | undefined;
export async function loginAccount(loginId: string, password: string, previousToken?: string) {
  requireLocalAccounts();
  loginId = loginIdSchema.parse(loginId);
  z.string().min(1).max(128).parse(password);
  const row = withDatabase((db) => accountRow.optional().parse(db.prepare("SELECT id,login_id,password_hash FROM student_accounts WHERE login_id=?").get(loginId)));
  dummyHash ??= hashPassword(randomBytes(32).toString("hex"));
  const valid = await verifyPassword(password, row?.password_hash ?? await dummyHash);
  if (!row || !valid) throw new ApiError(401, "INVALID_CREDENTIALS", "Login ID or password is incorrect.");
  return withDatabase((db) => transaction(db, () => ({ account: { id: row.id, loginId: row.login_id }, token: newSession(db, row.id, previousToken) })));
}