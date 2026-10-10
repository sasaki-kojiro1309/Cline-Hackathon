import "server-only";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { ApiError } from "./errors";
import { resolveIdentity, applyAuthCookies, type Identity } from "./local-auth";
import { enforceLimit } from "./rate-limit";
export { ApiError } from "./errors";

export function verifyOrigin(request: NextRequest) {
  const expected = process.env.APP_ORIGIN || new URL(request.url).origin;
  if (process.env.VERCEL && !process.env.APP_ORIGIN) throw new ApiError(503, "ORIGIN_NOT_CONFIGURED", "Set APP_ORIGIN to the exact HTTPS deployment origin.");
  if (request.headers.get("origin") !== expected) throw new ApiError(403, "INVALID_ORIGIN", "This request must come from this app.");
}
export async function jsonBody<T>(request: NextRequest, schema: z.ZodType<T>): Promise<T> {
  verifyOrigin(request);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new ApiError(415, "JSON_REQUIRED", "Send JSON data.");
  const text = await request.text();
  if (text.length > 10000) throw new ApiError(413, "BODY_TOO_LARGE", "The request is too large.");
  let input: unknown;
  try { input = JSON.parse(text); } catch { throw new ApiError(400, "INVALID_JSON", "The request contains invalid JSON."); }
  const result = schema.safeParse(input);
  if (!result.success) throw new ApiError(400, "INVALID_INPUT", result.error.issues[0]?.message ?? "Check your input.");
  return result.data;
}
export function endpoint(handler: (request: NextRequest, ownerId: string, identity: Identity) => Promise<unknown>, status = 200, options: { skipAuth?: boolean } = {}) {
  return async (request: NextRequest) => {
    const started = Date.now();
    const requestId = randomUUID();
    try {
      if (!["GET", "HEAD"].includes(request.method)) verifyOrigin(request);
      const identity: Identity = await resolveIdentity(request, !options.skipAuth);
      if (request.method !== "GET") {
        // Cloud has a database-backed limit. Do not trust arbitrary X-Forwarded-For.
        const network = process.env.VERCEL ? request.headers.get("x-vercel-forwarded-for") || "unknown" : "single-server";
        await enforceLimit(`writes:${network}`, 120, 60);
        if (identity.authenticated) await enforceLimit(`writes:${identity.ownerId}`, 40, 60);
      }
      const result = await handler(request, identity.ownerId, identity);
      const response = NextResponse.json(result, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
      applyAuthCookies(response, identity);
      console.info("AfterClass request", { requestId, route: new URL(request.url).pathname, status, durationMs: Date.now() - started });
      return response;
    } catch (error) {
      const known = error instanceof ApiError;
      if (!known) console.error("AfterClass request failed", { type: error instanceof Error ? error.name : "UnknownError" });
      console.info("AfterClass request", { requestId, route: new URL(request.url).pathname, status: known ? error.status : 500, durationMs: Date.now() - started });
      return NextResponse.json({ error: { code: known ? error.code : "STORAGE_ERROR", message: known ? error.message : "Your data could not be read or saved. Check server configuration and retry." } },
        { status: known ? error.status : 500, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId, ...(known && error.status === 429 ? { "Retry-After": "60" } : {}) } });
    }
  };
}