import { ReflectionForm } from "@/components/reflection-form";
import { providerLabels, type AIProvider } from "@/lib/ai-providers";
import { connection } from "next/server";

export default async function CheckIn() {
  await connection();
  const provider = process.env.AI_PROVIDER?.trim() || "openai";
  const providerLabel = Object.hasOwn(providerLabels, provider) ? providerLabels[provider as AIProvider] : "the configured AI service";
  return <>
    <p className="eyebrow">01 / Reflect</p>
    <h1>Daily Check-in</h1>
    <p className="intro">What stood out in class, a lab, a project, or an event today?</p>
    <ReflectionForm providerLabel={providerLabel} />
  </>;
}