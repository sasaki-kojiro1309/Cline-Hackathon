import { ReflectionForm } from "@/components/reflection-form";
import { providerLabels, type AIProvider } from "@/lib/ai-providers";
import { connection } from "next/server";
import Link from "next/link";
import { PageHero } from "@/components/page-hero";

export default async function CheckIn() {
  await connection();
  const provider = process.env.AI_PROVIDER?.trim() || "openai";
  const providerLabel = Object.hasOwn(providerLabels, provider) ? providerLabels[provider as AIProvider] : "the configured AI service";
  return <>
    <PageHero step="01 / Reflect · A little pause, a new possibility" title="Daily Check-in" description="What stood out in class, a lab, a project, or an event today? A few honest sentences can open a new door.">
      <a className="button" href="#reflection">Write your reflection <span aria-hidden="true">→</span></a>
      <Link className="button secondary" href="/discoveries">My discoveries</Link>
    </PageHero>
    <ReflectionForm providerLabel={providerLabel} />
  </>;
}