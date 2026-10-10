import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod/v4";

export function signSession(id: string, secret: string): string {
  return `${id}.${createHmac("sha256", secret).update(id).digest("base64url")}`;
}
export function verifySession(value: string | undefined, secret: string): string | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 2 || !z.uuid().safeParse(parts[0]).success || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) return null;
  const expected = Buffer.from(signSession(parts[0], secret).split(".")[1]);
  const actual = Buffer.from(parts[1]);
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? parts[0] : null;
}