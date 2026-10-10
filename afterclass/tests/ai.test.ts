import { beforeEach, describe, expect, it, vi } from "vitest";
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
beforeEach(() => { parse.mockReset(); vi.stubEnv("OPENAI_API_KEY", "test-not-real"); vi.stubEnv("OPENAI_MODEL", "test-model"); });
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
    parse.mockRejectedValue(new OpenAI.APIError(429, {}, "private error details", new Headers()));
    await expect(analyzeReflection(reflection().text)).rejects.toMatchObject({ status: 503, code: "AI_UNAVAILABLE" });
  });
});