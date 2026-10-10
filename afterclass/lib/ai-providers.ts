import "server-only";
import { z } from "zod/v4";
import { ApiError } from "./api";

const providers = ["openai", "gemini", "anthropic", "openai-compatible"] as const;
export type AIProvider = typeof providers[number];
export function getAIConfig() {
  const selected = process.env.AI_PROVIDER?.trim() || "openai";
  if (!providers.includes(selected as AIProvider)) throw new ApiError(503, "AI_NOT_CONFIGURED", "Set AI_PROVIDER to openai, gemini, anthropic or openai-compatible in .env.local and restart the server.");
  const provider = selected as AIProvider;
  // Never reuse an OpenAI key for a different provider.
  const apiKey = process.env.AI_API_KEY?.trim() || (provider === "openai" ? process.env.OPENAI_API_KEY?.trim() : "");
  const model = process.env.AI_MODEL?.trim() || (provider === "openai" ? process.env.OPENAI_MODEL?.trim() : "");
  if (!apiKey || !model) throw new ApiError(503, "AI_NOT_CONFIGURED", "AI is not configured yet. Set AI_PROVIDER, AI_API_KEY and AI_MODEL in .env.local (or OPENAI_API_KEY and OPENAI_MODEL for OpenAI), restart the server, and retry.");
  const outputMode = process.env.AI_OUTPUT_MODE?.trim() || "json_schema";
  let baseURL = "";
  if (provider === "openai-compatible") {
    if (!["json_schema", "json_object"].includes(outputMode)) throw new ApiError(503, "AI_NOT_CONFIGURED", "Set AI_OUTPUT_MODE to json_schema or json_object.");
    try {
      const url = new URL(process.env.AI_BASE_URL?.trim() || "");
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error();
      baseURL = url.toString().replace(/\/$/, "");
    } catch {
      throw new ApiError(503, "AI_NOT_CONFIGURED", "Set AI_BASE_URL to the trusted provider's HTTPS API base URL, without credentials, query or fragment.");
    }
  }
  return { provider, apiKey, model, baseURL, outputMode };
}
export const providerLabels: Record<AIProvider, string> = {
  openai: "OpenAI", gemini: "Google Gemini", anthropic: "Anthropic Claude", "openai-compatible": "your configured AI service",
};
export class ProviderError extends Error {
  constructor(public status: number | undefined, public code: string | undefined, public type: string | undefined, message: string) { super(message); }
}
const textBlock = z.object({ type: z.string().optional(), text: z.string().optional(), thought: z.boolean().optional() });
const geminiResponse = z.object({ candidates: z.array(z.object({ finishReason: z.string(), content: z.object({ parts: z.array(textBlock) }) })).min(1) });
const claudeResponse = z.object({ stop_reason: z.string(), content: z.array(textBlock) });
const chatResponse = z.object({ choices: z.array(z.object({ finish_reason: z.string(), message: z.object({ content: z.string(), refusal: z.string().nullable().optional() }) })).min(1) });
const errorResponse = z.object({ error: z.object({ code: z.union([z.string(), z.number()]).optional(), type: z.string().optional(), status: z.string().optional(), message: z.string().optional() }) });

export async function requestProvider(config: ReturnType<typeof getAIConfig>, system: string, user: string, schema: Record<string, unknown>): Promise<unknown> {
  let url: string;
  let headers: Record<string, string>;
  let body: Record<string, unknown>;
  if (config.provider === "gemini") {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model.replace(/^models\//, ""))}:generateContent`;
    headers = { "x-goog-api-key": config.apiKey };
    body = { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema, maxOutputTokens: 4096 } };
  } else if (config.provider === "anthropic") {
    url = "https://api.anthropic.com/v1/messages";
    headers = { "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" };
    body = { model: config.model, max_tokens: 1600, system, messages: [{ role: "user", content: user }], output_config: { format: { type: "json_schema", schema } } };
  } else {
    url = `${config.baseURL}/chat/completions`;
    headers = { Authorization: `Bearer ${config.apiKey}` };
    body = { model: config.model, messages: [{ role: "system", content: `${system}\nReturn only JSON matching this schema: ${JSON.stringify(schema)}` }, { role: "user", content: user }], max_tokens: 1600,
      response_format: config.outputMode === "json_object" ? { type: "json_object" } : { type: "json_schema", json_schema: { name: "afterclass_reflection_analysis", strict: true, schema } } };
    if (new URL(config.baseURL).hostname === "openrouter.ai") body.provider = { require_parameters: true, allow_fallbacks: false };
  }
  const signal = AbortSignal.timeout(25000);
  let response: Response;
  let raw: string;
  try {
    response = await fetch(url, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body), signal, redirect: "error", cache: "no-store" });
    raw = await response.text();
  } catch {
    throw new ProviderError(undefined, signal.aborted ? "timeout" : "connection", undefined, "Provider connection failed");
  }
  let data: unknown;
  try { data = JSON.parse(raw); } catch {
    if (!response.ok) throw new ProviderError(response.status, undefined, undefined, "Provider request failed");
    throw new ApiError(502, "AI_INVALID_RESPONSE", "The AI returned invalid JSON. Your reflection was not saved; please retry.");
  }
  if (!response.ok) {
    const details = errorResponse.safeParse(data);
    const error = details.success ? details.data.error : undefined;
    throw new ProviderError(response.status, typeof error?.code === "string" ? error.code : undefined, error?.type ?? error?.status, error?.message ?? "Provider request failed");
  }
  let text: string;
  if (config.provider === "gemini") {
    const candidate = geminiResponse.parse(data).candidates[0];
    if (candidate.finishReason !== "STOP") throw new Error("Incomplete or refused output");
    text = candidate.content.parts.filter((part) => !part.thought).map((part) => part.text ?? "").join("");
  } else if (config.provider === "anthropic") {
    const result = claudeResponse.parse(data);
    if (result.stop_reason !== "end_turn") throw new Error("Incomplete or refused output");
    text = result.content.filter((part) => part.type === "text").map((part) => part.text ?? "").join("");
  } else {
    const choice = chatResponse.parse(data).choices[0];
    if (choice.finish_reason !== "stop" || choice.message.refusal) throw new Error("Incomplete or refused output");
    text = choice.message.content;
  }
  return JSON.parse(text);
}