import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyAnalysis, reflection } from "./fixtures";
vi.mock("server-only", () => ({}));
import { analyzeReflection } from "@/lib/ai";
import { getAIConfig } from "@/lib/ai-providers";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("AI_PROVIDER", "gemini"); vi.stubEnv("AI_API_KEY", "private-test-key"); vi.stubEnv("AI_MODEL", "test-model");
  vi.stubEnv("AI_BASE_URL", "https://api.example.com/v1"); vi.stubEnv("AI_OUTPUT_MODE", "json_schema");
  vi.stubEnv("OPENAI_API_KEY", "legacy-key"); vi.stubEnv("OPENAI_MODEL", "legacy-model");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const analysisText = JSON.stringify(emptyAnalysis);
const gemini = (text = analysisText, finishReason = "STOP") => ({ candidates: [{ finishReason, content: { parts: [{ text }] } }] });
const claude = (text = analysisText, stop_reason = "end_turn") => ({ stop_reason, content: [{ type: "text", text }] });
const chat = (text = analysisText, finish_reason = "stop") => ({ choices: [{ finish_reason, message: { content: text } }] });
function request() { return fetchMock.mock.calls[0] as [string, RequestInit]; }
function requestBody() { return JSON.parse(request()[1].body as string); }

describe("multi-provider AI (network mocked)", () => {
  it("retries a transient REST failure once then accepts a validated result", async () => {
    fetchMock.mockImplementationOnce(async () => json({ error: {} }, 500));
    fetchMock.mockImplementationOnce(async () => json(gemini()));
    expect((await analyzeReflection(reflection().text)).interests).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("sends Gemini schema and key in a header, validates and sanitizes output", async () => {
    fetchMock.mockResolvedValue(json(gemini(JSON.stringify({ ...emptyAnalysis, interests: ["coding", "programming"] }))));
    expect((await analyzeReflection(reflection().text)).interests).toEqual(["programming"]);
    expect(request()[0]).toBe("https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent");
    expect(request()[1]).toMatchObject({ headers: { "x-goog-api-key": "private-test-key" }, redirect: "error", cache: "no-store" });
    expect(requestBody().generationConfig).toMatchObject({ responseMimeType: "application/json", responseJsonSchema: { type: "object", additionalProperties: false } });
    expect(requestBody().systemInstruction.parts[0].text).toContain("untrusted data");
    expect(request()[0]).not.toContain("private-test-key");
  });
  it("uses Claude Messages API with native structured output", async () => {
    vi.stubEnv("AI_PROVIDER", "anthropic"); fetchMock.mockResolvedValue(json(claude()));
    expect(await analyzeReflection(reflection().text)).toMatchObject({ interests: [] });
    expect(request()[0]).toBe("https://api.anthropic.com/v1/messages");
    expect(request()[1].headers).toMatchObject({ "x-api-key": "private-test-key", "anthropic-version": "2023-06-01" });
    expect(requestBody()).toMatchObject({ model: "test-model", output_config: { format: { type: "json_schema", schema: { type: "object" } } } });
  });
  it.each(["json_schema", "json_object"])("uses compatible chat completions with %s output", async (mode) => {
    vi.stubEnv("AI_PROVIDER", "openai-compatible"); vi.stubEnv("AI_OUTPUT_MODE", mode); fetchMock.mockResolvedValue(json(chat()));
    await analyzeReflection(reflection().text);
    expect(request()[0]).toBe("https://api.example.com/v1/chat/completions");
    expect(request()[1].headers).toMatchObject({ Authorization: "Bearer private-test-key" });
    expect(requestBody().response_format.type).toBe(mode);
    expect(requestBody().messages[0].content).toContain("Return only JSON matching this schema");
  });
  it("disables OpenRouter fallback and requires supported parameters", async () => {
    vi.stubEnv("AI_PROVIDER", "openai-compatible"); vi.stubEnv("AI_BASE_URL", "https://openrouter.ai/api/v1/"); fetchMock.mockResolvedValue(json(chat()));
    await analyzeReflection(reflection().text);
    expect(requestBody().provider).toEqual({ require_parameters: true, allow_fallbacks: false });
  });
  it("preserves legacy OpenAI config and lets generic settings override it", () => {
    vi.stubEnv("AI_PROVIDER", ""); vi.stubEnv("AI_API_KEY", ""); vi.stubEnv("AI_MODEL", "");
    expect(getAIConfig()).toMatchObject({ provider: "openai", apiKey: "legacy-key", model: "legacy-model" });
    vi.stubEnv("AI_API_KEY", "generic-key"); vi.stubEnv("AI_MODEL", "generic-model");
    expect(getAIConfig()).toMatchObject({ apiKey: "generic-key", model: "generic-model" });
  });
  it("does not send a legacy OpenAI key to another provider", async () => {
    vi.stubEnv("AI_API_KEY", "");
    await expect(analyzeReflection(reflection().text)).rejects.toMatchObject({ code: "AI_NOT_CONFIGURED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["unsupported", "gemini-invalid"])("rejects unknown provider %s", async (provider) => {
    vi.stubEnv("AI_PROVIDER", provider);
    await expect(analyzeReflection(reflection().text)).rejects.toMatchObject({ code: "AI_NOT_CONFIGURED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["", "http://api.example.com/v1", "https://key@api.example.com/v1", "https://api.example.com/v1?key=secret", "https://api.example.com/v1#fragment"])("rejects unsafe or missing compatible URL %s", async (url) => {
    vi.stubEnv("AI_PROVIDER", "openai-compatible"); vi.stubEnv("AI_BASE_URL", url);
    await expect(analyzeReflection(reflection().text)).rejects.toMatchObject({ code: "AI_NOT_CONFIGURED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects invalid compatible output mode", async () => {
    vi.stubEnv("AI_PROVIDER", "openai-compatible"); vi.stubEnv("AI_OUTPUT_MODE", "text");
    await expect(analyzeReflection(reflection().text)).rejects.toMatchObject({ code: "AI_NOT_CONFIGURED" });
  });
  it.each([
    ["gemini", gemini("{}")], ["gemini", gemini("not JSON")], ["gemini", gemini(analysisText, "MAX_TOKENS")],
    ["gemini", { promptFeedback: { blockReason: "SAFETY" } }],
    ["anthropic", claude(analysisText, "refusal")], ["anthropic", claude(analysisText, "max_tokens")],
    ["openai-compatible", chat(analysisText, "length")], ["openai-compatible", chat("{}")],
    ["openai-compatible", { choices: [{ finish_reason: "stop", message: { content: analysisText, refusal: "Refused" } }] }],
  ])("rejects invalid/refused/incomplete %s output", async (provider, response) => {
    vi.stubEnv("AI_PROVIDER", provider); fetchMock.mockResolvedValue(json(response));
    await expect(analyzeReflection(reflection().text)).rejects.toMatchObject({ status: 502, code: "AI_INVALID_RESPONSE" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([
    [401, { type: "authentication_error" }, "AI_AUTH_ERROR"],
    [402, { message: "Insufficient credits" }, "AI_QUOTA_EXCEEDED"],
    [429, { message: "Private quota and billing details" }, "AI_QUOTA_EXCEEDED"],
    [429, { type: "rate_limit_error" }, "AI_RATE_LIMITED"],
    [403, {}, "AI_ACCESS_ERROR"], [404, {}, "AI_MODEL_NOT_FOUND"], [400, {}, "AI_REQUEST_REJECTED"], [500, {}, "AI_UNAVAILABLE"],
  ])("classifies REST provider error %s safely", async (status, error, code) => {
    fetchMock.mockImplementation(async () => json({ error }, status));
    await expect(analyzeReflection(reflection().text)).rejects.toMatchObject({ status: 503, code });
    expect(console.error).toHaveBeenCalledWith("AfterClass gemini request failed", { category: code, status });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(/private-test-key|Private quota/);
    expect(fetchMock).toHaveBeenCalledTimes(status >= 500 ? 2 : 1);
  });
  it("handles non-JSON service failures without exposing them", async () => {
    fetchMock.mockImplementation(async () => new Response("private service error", { status: 503 }));
    await expect(analyzeReflection(reflection().text)).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  });
  it.each([
    [400, { status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }] }, "AI_AUTH_ERROR", "valid Gemini API key"],
    [403, { message: "Your API key was reported as leaked. private-test-key" }, "AI_AUTH_ERROR", "Revoke"],
    [403, { details: [{ reason: "SERVICE_DISABLED", metadata: { project: "private-project" } }] }, "AI_ACCESS_ERROR", "Enable generativelanguage.googleapis.com"],
    [403, { details: [{ reason: "API_KEY_HTTP_REFERRER_BLOCKED" }] }, "AI_ACCESS_ERROR", "server-compatible restrictions"],
    [403, { details: [{ reason: "API_KEY_SERVICE_BLOCKED" }] }, "AI_ACCESS_ERROR", "server-compatible restrictions"],
    [404, { status: "NOT_FOUND" }, "AI_MODEL_NOT_FOUND", "Changing keys alone"],
    [404, { message: "This model is no longer available to new users. private-project" }, "AI_MODEL_NOT_FOUND", "retired or restricted"],
    [400, { status: "INVALID_ARGUMENT" }, "AI_REQUEST_REJECTED", "not Gemini"],
  ])("gives actionable Gemini diagnostics for %s without exposing upstream details", async (status, error, code, hint) => {
    fetchMock.mockResolvedValue(json({ error }, status));
    await expect(analyzeReflection(reflection().text)).rejects.toMatchObject({ status: 503, code, message: expect.stringContaining(hint) });
    try { await analyzeReflection(reflection().text); } catch (failure) {
      expect(String(failure)).not.toMatch(/private-test-key|private-project/);
    }
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(/private-test-key|private-project/);
  });
  it("handles malformed successful responses", async () => {
    fetchMock.mockResolvedValue(new Response("not JSON"));
    await expect(analyzeReflection(reflection().text)).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
  });
  it("handles connection errors without logging the underlying cause", async () => {
    fetchMock.mockRejectedValue(new Error("private URL and credential"));
    await expect(analyzeReflection(reflection().text)).rejects.toMatchObject({ code: "AI_CONNECTION_ERROR" });
    expect(console.error).toHaveBeenCalledWith("AfterClass gemini request failed", { category: "AI_CONNECTION_ERROR", status: null });
  });
  it("handles timeouts", async () => {
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort()); fetchMock.mockRejectedValue(new Error("timeout"));
    await expect(analyzeReflection(reflection().text)).rejects.toMatchObject({ code: "AI_TIMEOUT" });
  });
});