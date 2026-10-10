"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod/v4";
import { analysisSchema, reflectionInputSchema } from "@/lib/schemas";
import { ensureSession, errorMessage, requestJson } from "@/lib/client-api";

const responseSchema = z.object({ reflection: z.object({ id: z.string(), text: z.string(), createdAt: z.string() }), analysis: analysisSchema });
export function ReflectionForm({ providerLabel }: { providerLabel: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const result = reflectionInputSchema.safeParse({ text });
    if (!result.success) { setError(result.error.issues[0].message); return; }
    setBusy(true); setError("");
    try {
      await ensureSession();
      await requestJson("/api/reflections", responseSchema, result.data);
      router.push("/discoveries");
    } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <form className="panel reflection-panel" onSubmit={submit}>
    <div className="hints"><p className="small">Need a starting point? These prompts are optional.</p><ul>
      <li>What did you enjoy today?</li>
      <li>What felt boring, difficult, or frustrating?</li>
      <li>What made you curious, or what would you like to try?</li>
    </ul></div>
    <label htmlFor="reflection">Your reflection</label>
    <textarea id="reflection" required maxLength={1500} value={text} onChange={(e) => setText(e.target.value)} disabled={busy}
      aria-describedby={`reflection-help${error ? " reflection-error" : ""}`} aria-invalid={!!error}
      placeholder="A few honest sentences are enough. What stayed with you today?" />
    <p id="reflection-help" className="small count">{text.length} / 1,500 characters · Minimum 20</p>
    {error && <p id="reflection-error" className="error" role="alert">{error} Your text is still here; submit again to retry.</p>}
    <button type="submit" disabled={busy}>{busy ? "Finding your insights…" : "Find my insights"}</button>
    <p className="small mt-4">Your reflection is sent to {providerLabel} for analysis and stored locally in this prototype. Avoid sensitive personal information.</p>
  </form>;
}