// Explicit opt-in only: this uses paid AI and persists a test reflection.
if (process.env.ALLOW_LIVE_SMOKE !== "true") {
  console.error("Set ALLOW_LIVE_SMOKE=true to authorize a paid AI smoke test against a running staging server.");
  process.exit(1);
}
const origin = new URL(process.env.SMOKE_ORIGIN || "http://localhost:3000").origin;
const cookies = new Map();
const loginId = `smoke_${crypto.randomUUID().replaceAll("-", "").slice(0,20)}`;
const password = crypto.randomUUID() + crypto.randomUUID();
async function api(path, body) {
  const response = await fetch(`${origin}/api/${path}`, {
    headers: { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "), ...(body ? { "Content-Type": "application/json", Origin: origin } : {}) },
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
  });
  for (const cookie of response.headers.getSetCookie()) { const [name, ...value] = cookie.split(";")[0].split("="); cookies.set(name, value.join("=")); }
  const data = await response.json();
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status} (${data.error?.code || "unknown"})`);
  return data;
}
try {
  await api("account", { action: "register", loginId, password });
  await api("session");
  await api("reflections", { text: "During our digital systems lab I enjoyed building logic circuits and want to understand how a simple processor works.", consent: true });
  const discoveries = await api("discoveries");
  if (!discoveries.hasReflections || !discoveries.evidence.length) throw new Error("Missing discoveries/evidence");
  let result = await api("recommendations");
  if (result.recommendations.length !== 3) throw new Error("Expected three suggestions");
  const dismissed = result.recommendations[0].id;
  await api("feedback", { opportunityId: dismissed, status: "not_interested" });
  result = await api("recommendations");
  if (result.recommendations.some((o) => o.id === dismissed)) throw new Error("Dismissal was not persisted");
  const saved = result.recommendations[0].id;
  await api("feedback", { opportunityId: saved, status: "saved" });
  result = await api("recommendations");
  if (!result.saved.some((o) => o.id === saved)) throw new Error("Save was not persisted");
  await api("feedback", { opportunityId: saved, status: "completed" });
  result = await api("recommendations");
  if (result.saved.some((o) => o.id === saved) || result.recommendations.some((o) => o.id === saved)) throw new Error("Completion was not persisted");
  const separate = await fetch(`${origin}/api/discoveries`);
  if (separate.status !== 401) throw new Error("Unauthenticated access was not blocked");
  console.log("PASS: account creation, live AI extraction, storage, evidence, recommendations, save/dismiss/completed, required authentication.");
} catch (error) { console.error(error instanceof Error ? error.message : "Smoke test failed"); process.exitCode = 1; }
finally {
  // Only the script-created account's data is deleted; its Login ID remains for auditing.
  try { if (cookies.size) { await api("privacy", { confirmation: "DELETE" }); await api("account", { action: "sign_out" }); } } catch { console.error("Test-data cleanup failed; use the staging database to remove this smoke account."); process.exitCode = 1; }
}