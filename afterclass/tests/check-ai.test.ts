import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const script = resolve(process.cwd(), "scripts/check-ai.mjs");
function run(status: number, data: unknown, generate = false) {
  return spawnSync(process.execPath, ["--input-type=module", "-e", `
    globalThis.fetch = async (url, options) => {
      if (${generate}) {
        if (options.method !== 'POST' || !url.endsWith('/test-model:generateContent')) throw new Error('Missing generation request');
        const body = JSON.parse(options.body);
        if (!body.contents[0].parts[0].text.startsWith('Synthetic API diagnostic') || body.generationConfig.responseMimeType !== 'application/json') throw new Error('Unsafe request');
      } else if (options.method || options.body || !url.endsWith('/test-model')) throw new Error('Unexpected generation request');
      return new Response(JSON.stringify(${JSON.stringify(data)}), { status: ${status} });
    };
    await import(${JSON.stringify(script)});
  `, ...(generate ? ["--", "--generate"] : [])], {
    cwd: process.cwd(), encoding: "utf8", timeout: 10000,
    env: { ...process.env, AI_PROVIDER: "gemini", AI_API_KEY: "private-test-key", AI_MODEL: "test-model" },
  });
}

describe("opt-in Gemini generation diagnostic", () => {
  it("requires explicit opt-in to test generation with synthetic text", () => {
    const result = run(200, { candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"ready":true}' }] } }] }, true);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("generation and JSON structured output succeeded");
  });
  it("detects retired generation despite available metadata", () => {
    const result = run(404, { error: { message: "This model is no longer available to new users. private-project" } }, true);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Metadata lookup may still succeed");
    expect(result.stderr).not.toContain("private-project");
  });
  it("rejects incomplete generation output", () => {
    const result = run(200, { candidates: [{ finishReason: "MAX_TOKENS" }] }, true);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("invalid output");
  });
});

describe("read-only Gemini diagnostic command", () => {
  it("checks metadata without making a generation request", () => {
    const result = run(200, { supportedGenerationMethods: ["generateContent"] });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS");
    expect(result.stdout).toContain("does not verify generation permission");
  });
  it.each([
    [404, { message: "private-test-key private-project" }, "AI_MODEL is unavailable"],
    [403, { details: [{ reason: "SERVICE_DISABLED" }] }, "Enable the Generative Language API"],
    [403, { details: [{ reason: "API_KEY_HTTP_REFERRER_BLOCKED" }] }, "not browser HTTP referrers"],
    [403, { message: "private-test-key was leaked" }, "Revoke"],
    [400, { details: [{ reason: "API_KEY_INVALID" }] }, "valid Gemini API key"],
    [429, {}, "rate limiting"],
    [503, {}, "temporarily unavailable"],
  ])("reports controlled guidance for HTTP %s", (status, error, hint) => {
    const result = run(status, { error });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(hint);
    expect(result.stdout + result.stderr).not.toMatch(/private-test-key|private-project/);
  });
});