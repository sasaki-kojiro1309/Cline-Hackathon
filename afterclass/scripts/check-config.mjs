import { loadEnvFile } from "node:process";
try { loadEnvFile(".env.local"); } catch { /* Hosting can supply environment directly. */ }
const mode = process.env.STORAGE_PROVIDER || "local";
let failed = false;
function check(name, condition, message) { console.log(`${condition ? "PASS" : "MISSING"}: ${name}${message ? ` — ${message}` : ""}`); if (!condition) failed = true; }
check("storage mode", mode === "local", "password accounts require local SQLite; Supabase auth is not enabled");
check("Node.js 24+", Number(process.versions.node.split(".")[0]) >= 24, "required for the bundled SQLite database");
if (mode === "local") console.log("SQLite creates the account/database tables automatically; Login ID/password is required. No Supabase or email setup.");
if (mode === "supabase") {
  for (const name of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "SESSION_SIGNING_SECRET"]) check(name, !!process.env[name]);
  check("signing secret length", (process.env.SESSION_SIGNING_SECRET?.length || 0) >= 32);
}
const provider = process.env.AI_PROVIDER || "openai";
check("AI key", !!(process.env.AI_API_KEY || (provider === "openai" && process.env.OPENAI_API_KEY)));
check("AI model", !!(process.env.AI_MODEL || (provider === "openai" && process.env.OPENAI_MODEL)));
if (provider === "openai-compatible") check("AI_BASE_URL", !!process.env.AI_BASE_URL);
if (process.env.VERCEL) { check("persistent cloud storage", mode === "supabase"); check("APP_ORIGIN", /^https:\/\//.test(process.env.APP_ORIGIN || "")); }
console.log("Presence checks only; no secret values printed, no service calls, no proof of credential validity or migration execution.");
if (failed) process.exitCode = 1;