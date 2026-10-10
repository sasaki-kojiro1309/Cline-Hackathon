import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyAnalysis, reflection } from "./fixtures";
vi.mock("server-only", () => ({}));
const parse = vi.hoisted(() => vi.fn());
vi.mock("openai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openai")>();
  class MockOpenAI extends actual.default {
    constructor(options: ConstructorParameters<typeof actual.default>[0]) {
      super(options);
      this.responses.parse = parse;
    }
  }
  return { ...actual, default: MockOpenAI };
});
import { analyzeReflection } from "@/lib/ai";
import OpenAI from "openai";
beforeEach(() => { parse.mockReset(); vi.stubEnv("AI_PROVIDER", "openai"); vi.stubEnv("AI_API_KEY", ""); vi.stubEnv("AI_MODEL", ""); vi.stubEnv("OPENAI_API_KEY", "test-not-real"); vi.stubEnv("OPENAI_MODEL", "test-model"); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("AI integration (SDK network mocked)", () => {
  it("uses configured model, strict structured output and privacy option", async () => {
    parse.mockResolvedValue({ output_parsed: { ...emptyAnalysis, interests: [" Digital Systems ", "digital systems"] } });
    const result = await analyzeReflection(reflection().text);
    expect(result.interests).toEqual(["digital systems"]);
    expect(parse.mock.calls[0][0]).toMatchObject({ model: "test-model", store: false, text: { format: { type: "json_schema", strict: true } } });
    expect(parse.mock.calls[0][0].input[0].content).toContain("untrusted data");
  });
  it("missing credentials return actionable 503", async () => {
    vi.stubEnv("OPENAI_API_KEY", ""); await expect(analyzeReflection(reflection().text)).rejects.toMatchObject({ status: 503, code: "AI_NOT_CONFIGURED" });
    expect(parse).not.toHaveBeenCalled();
  });
  it("refusals and invalid outputs are 502, not fabricated insights", async () => {
    parse.mockResolvedValueOnce({ output_parsed: null }); await expect(analyzeReflection(reflection().text)).rejects.toMatchObject({ status: 502 });
    parse.mockResolvedValueOnce({ output_parsed: { interests: "bad" } }); await expect(analyzeReflection(reflection().text)).rejects.toMatchObject({ status: 502 });
  });
  it("service errors return safe 503 without private error contents", async () => {
    parse.mockRejectedValue(new OpenAI.APIError(500, {}, "private error details", new Headers()));
    await expect(analyzeReflection(reflection().text)).rejects.toMatchObject({ status: 503, code: "AI_UNAVAILABLE" });
    expect(console.error).toHaveBeenCalledWith("AfterClass OpenAI request failed", { category: "AI_UNAVAILABLE", status: 500 });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private error details");
  });
  it.each([
    [401, "invalid_api_key", "AI_AUTH_ERROR", "valid key"],
    [429, "insufficient_quota", "AI_QUOTA_EXCEEDED", "billing"],
    [429, "rate_limit_exceeded", "AI_RATE_LIMITED", "Wait"],
    [403, null, "AI_ACCESS_ERROR", "permissions"],
    [404, "model_not_found", "AI_ACCESS_ERROR", "OPENAI_MODEL"],
    [400, null, "AI_REQUEST_REJECTED", "Structured Outputs"],
    [422, null, "AI_REQUEST_REJECTED", "Structured Outputs"],
  ])("classifies provider status %s with code %s safely", async (status, providerCode, code, hint) => {
    parse.mockRejectedValue(new OpenAI.APIError(status, { code: providerCode }, "private key and reflection", new Headers()));
    await expect(analyzeReflection(reflection().text)).rejects.toMatchObject({ status: 503, code, message: expect.stringContaining(hint) });
    expect(console.error).toHaveBeenCalledWith("AfterClass OpenAI request failed", { category: code, status });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private key and reflection");
  });
  it.each([
    [new OpenAI.APIConnectionError({ message: "private connection details" }), "AI_CONNECTION_ERROR", "proxy or firewall"],
    [new OpenAI.APIConnectionTimeoutError(), "AI_TIMEOUT", "timed out"],
  ])("classifies connection failures safely (%s)", async (error, code, hint) => {
    parse.mockRejectedValue(error);
    await expect(analyzeReflection(reflection().text)).rejects.toMatchObject({ status: 503, code, message: expect.stringContaining(hint) });
    expect(console.error).toHaveBeenCalledWith("AfterClass OpenAI request failed", { category: code, status: null });
  });
  it("recognizes quota errors without a provider code without exposing their message", async () => {
    parse.mockRejectedValue(new OpenAI.APIError(429, { message: "Check your quota and billing. Private account details." }, undefined, new Headers()));
    await expect(analyzeReflection(reflection().text)).rejects.toMatchObject({ status: 503, code: "AI_QUOTA_EXCEEDED", message: expect.stringContaining("API billing") });
    expect(console.error).toHaveBeenCalledWith("AfterClass OpenAI request failed", { category: "AI_QUOTA_EXCEEDED", status: 429 });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("Private account details");
  });
});