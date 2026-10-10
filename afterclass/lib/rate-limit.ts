import "server-only";
import { createHash } from "node:crypto";
import { adminClient, storageMode } from "./supabase";
import { ApiError } from "./errors";
import { withDatabase, transaction } from "./sqlite-db";

export function consumeLocalLimit(key: string, limit: number, seconds: number, now = Date.now()) {
  return withDatabase((db) => transaction(db, () => {
    db.prepare("DELETE FROM request_limits WHERE window_start < ?").run(now - 86400000);
    const row = db.prepare("SELECT window_start,hits FROM request_limits WHERE key = ?").get(key);
    const start = row && typeof row.window_start === "number" ? row.window_start : now;
    const previousHits = row && typeof row.hits === "number" ? row.hits : 0;
    const expired = !row || now - start >= seconds * 1000;
    const hits = expired ? 1 : previousHits + 1;
    db.prepare(`INSERT INTO request_limits(key,window_start,hits) VALUES(?,?,?)
      ON CONFLICT(key) DO UPDATE SET window_start=excluded.window_start,hits=excluded.hits`)
      .run(key, expired ? now : start, hits);
    return hits <= limit;
  }));
}
export async function enforceLimit(key: string, limit: number, seconds: number) {
  if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(seconds) || seconds < 1) throw new ApiError(503, "INVALID_LIMIT", "Request limits are not configured correctly.");
  const hashed = createHash("sha256").update(key).digest("hex");
  let allowed: boolean;
  if (storageMode() === "local") allowed = consumeLocalLimit(hashed, limit, seconds);
  else {
    const { data, error } = await adminClient().rpc("consume_request_limit", { p_key: hashed, p_limit: limit, p_seconds: seconds });
    if (error || typeof data !== "boolean") throw new ApiError(503, "LIMITER_UNAVAILABLE", "Request protection is temporarily unavailable. Please retry.");
    allowed = data;
  }
  if (!allowed) throw new ApiError(429, "RATE_LIMITED", "Too many requests. Please wait a minute before retrying.");
}