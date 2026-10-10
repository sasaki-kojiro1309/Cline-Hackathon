import "server-only";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { sessionSecret } from "./local-store";
import { signSession, verifySession } from "./session-signing";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export async function jsonBody<T>(request: NextRequest, schema: z.ZodType<T>): Promise<T> {
  if (request.headers.get("origin") !== new URL(request.url).origin) throw new ApiError(403, "INVALID_ORIGIN", "This request must come from this app.");
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new ApiError(415, "JSON_REQUIRED", "Send JSON data.");
  const text = await request.text();
  if (text.length > 10000) throw new ApiError(413, "BODY_TOO_LARGE", "The request is too large.");
  let input: unknown;
  try { input = JSON.parse(text); } catch { throw new ApiError(400, "INVALID_JSON", "The request contains invalid JSON."); }
  const result = schema.safeParse(input);
  if (!result.success) throw new ApiError(400, "INVALID_INPUT", result.error.issues[0]?.message ?? "Check your input.");
  return result.data;
}
export function endpoint(handler: (request: NextRequest, sessionId: string) => Promise<unknown>, status = 200) {
  return async (request: NextRequest) => {
    try {
      const secret = await sessionSecret();
      const sessionId = verifySession(request.cookies.get("afterclass_session")?.value, secret) ?? randomUUID();
      const result = await handler(request, sessionId);
      const response = NextResponse.json(result, { status, headers: { "Cache-Control": "no-store" } });
      response.cookies.set("afterclass_session", signSession(sessionId, secret), {
        httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production", maxAge: 30 * 86400,
      });
      return response;
    } catch (error) {
      const known = error instanceof ApiError;
      if (!known) console.error("AfterClass request failed", { type: error instanceof Error ? error.name : "UnknownError" });
      return NextResponse.json({ error: { code: known ? error.code : "STORAGE_ERROR", message: known ? error.message : "Your data could not be read or saved. Check the server's local data directory and retry." } },
        { status: known ? error.status : 500, headers: { "Cache-Control": "no-store" } });
    }
  };
}