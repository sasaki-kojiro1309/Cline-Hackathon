"use client";
import { z } from "zod/v4";

const errorSchema = z.object({ error: z.object({ message: z.string() }) });
export async function requestJson<T>(url: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...(body === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }) });
  const json: unknown = await response.json();
  if (!response.ok) {
    const error = errorSchema.safeParse(json);
    throw new Error(error.success ? error.data.error.message : "The request failed. Please retry.");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new Error("The server returned an unexpected response. Please retry.");
  return parsed.data;
}
let sessionRequest: Promise<unknown> | undefined;
export function ensureSession() {
  sessionRequest ??= requestJson("/api/session", z.object({ ready: z.literal(true) })).catch((error: unknown) => {
    sessionRequest = undefined;
    throw error;
  });
  return sessionRequest;
}
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please retry.";
}