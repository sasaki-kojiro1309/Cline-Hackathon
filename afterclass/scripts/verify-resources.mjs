import { readFile } from "node:fs/promises";
const resources = JSON.parse(await readFile(new URL("../data/verified-resources.json", import.meta.url), "utf8"));
let failed = false;
for (const resource of resources) {
  try {
    const response = await fetch(resource.url, { signal: AbortSignal.timeout(20000), redirect: "follow" });
    console.log(`${resource.id}: HTTP ${response.status} — ${resource.url}`);
    if (!response.ok) failed = true;
    await response.body?.cancel();
  } catch { failed = true; console.error(`${resource.id}: connection failed`); }
}
console.log("HTTP reachability alone does not verify contents, suitability, fees or availability. Review pages manually before updating verified_at.");
if (failed) process.exitCode = 1;