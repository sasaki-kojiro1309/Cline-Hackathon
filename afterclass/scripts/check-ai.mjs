// Read-only by default. --generate opts into a synthetic request using API quota.
// Use the same environment-file precedence as Next's development server.
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd(), true);

const provider = process.env.AI_PROVIDER?.trim() || "openai";
const apiKey = process.env.AI_API_KEY?.trim();
const model = process.env.AI_MODEL?.trim()?.replace(/^models\//, "");
const generate = process.argv.includes("--generate");
if (provider !== "gemini") {
  console.error("This read-only check supports AI_PROVIDER=gemini. Use npm run check:config for other providers.");
  process.exitCode = 1;
} else if (!apiKey || !model) {
  console.error("Set AI_API_KEY and AI_MODEL in .env.local, then restart the server.");
  process.exitCode = 1;
} else {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}${generate ? ":generateContent" : ""}`, {
      headers: { "x-goog-api-key": apiKey, ...(generate ? { "Content-Type": "application/json" } : {}) }, signal: AbortSignal.timeout(generate ? 60000 : 15000), redirect: "error", cache: "no-store",
      ...(generate ? { method: "POST", body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Synthetic API diagnostic. Return ready as true." }] }],
        generationConfig: { responseMimeType: "application/json", responseJsonSchema: { type: "object", properties: { ready: { type: "boolean" } }, required: ["ready"], additionalProperties: false }, maxOutputTokens: 4096 },
      }) } : {}),
    });
    const data = await response.json();
    if (response.ok) {
      if (generate) {
        const candidate = data.candidates?.[0];
        const text = candidate?.content?.parts?.filter((part) => !part.thought).map((part) => part.text || "").join("");
        if (candidate?.finishReason !== "STOP" || JSON.parse(text || "null")?.ready !== true) throw new Error("Invalid diagnostic output");
        console.log("PASS: Gemini generation and JSON structured output succeeded with the configured key/model.");
        console.log("Only synthetic diagnostic text was sent. No student data or database changes.");
      } else if (Array.isArray(data.supportedGenerationMethods) && data.supportedGenerationMethods.includes("generateContent")) {
        console.log("PASS: Gemini accepted the configured key for model metadata lookup.");
        console.log("This does not verify generation permission, quota or structured output. Retired models may still return metadata. No AI output was generated.");
        console.log("To verify actual generation using a small amount of API quota: npm run check:ai -- --generate");
      } else {
        console.error("FAIL: Model metadata does not advertise generateContent support.");
        process.exitCode = 1;
      }
      console.log("Restart npm run dev after changing .env.local.");
    } else {
      process.exitCode = 1;
      console.error(`FAIL: Gemini ${generate ? "generation" : "model lookup"} HTTP ${response.status}.`);
      // Only print fixed guidance, never upstream messages/metadata or credentials.
      const reasons = Array.isArray(data.error?.details) ? data.error.details.map((detail) => detail?.reason) : [];
      if (/leaked/i.test(data.error?.message || "")) console.error("Google blocked this key as leaked. Revoke it and create a new key in Google AI Studio.");
      else if (reasons.includes("SERVICE_DISABLED")) console.error("Enable the Generative Language API in the Google project that owns this key.");
      else if (reasons.some((reason) => typeof reason === "string" && /^API_KEY_.*_BLOCKED$/.test(reason))) console.error("Check key restrictions: allow the Generative Language API and server requests, not browser HTTP referrers.");
      else if (response.status === 404) {
        console.error("AI_MODEL is unavailable on v1beta. Choose a model available to this project; changing keys alone will not fix the model name.");
        if (/no longer available|deprecated|retired|discontinued/i.test(data.error?.message || "")) console.error("Google has retired or restricted this model. Metadata lookup may still succeed even though generation is unavailable.");
      }
      else if (response.status === 401 || reasons.includes("API_KEY_INVALID") || reasons.includes("API_KEY_EXPIRED")) console.error("Update AI_API_KEY with a valid Gemini API key from Google AI Studio.");
      else if (response.status === 403) console.error("Check Google project permissions, API enablement and key restrictions in Google AI Studio.");
      else if (response.status === 429) console.error("Google is rate limiting this lookup. Wait and check project quota.");
      else if (response.status >= 500) console.error("Google Gemini is temporarily unavailable for this request. Wait and retry; replacing API keys will not fix a service outage.");
      else console.error("Check AI_MODEL, AI_API_KEY and Google service availability.");
    }
  } catch {
    console.error("FAIL: Gemini diagnostic failed, timed out or returned invalid output. Check internet access, proxy and firewall. No private error details were printed.");
    process.exitCode = 1;
  }
}