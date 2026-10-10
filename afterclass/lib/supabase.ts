import "server-only";
import { createClient } from "@supabase/supabase-js";
import { ApiError } from "./errors";

export function storageMode(): "local" | "supabase" {
  const mode = process.env.STORAGE_PROVIDER || "local";
  if (mode !== "local" && mode !== "supabase") throw new ApiError(503, "STORAGE_NOT_CONFIGURED", "STORAGE_PROVIDER must be local or supabase.");
  if (mode === "local" && process.env.VERCEL) throw new ApiError(503, "STORAGE_NOT_CONFIGURED", "Cloud deployment requires Supabase storage. Local files are not persistent on Vercel.");
  return mode;
}
function config(keyName: string) {
  const url = process.env.SUPABASE_URL, key = process.env[keyName];
  if (!url || !key || !/^https:\/\//.test(url)) throw new ApiError(503, "SUPABASE_NOT_CONFIGURED", `Configure SUPABASE_URL and ${keyName} on the server.`);
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
}
export const adminClient = () => config("SUPABASE_SERVICE_ROLE_KEY");
export const authClient = () => config("SUPABASE_ANON_KEY");
export const authEnabled = () => storageMode() === "supabase" && !!process.env.SUPABASE_ANON_KEY;