"use client";
import Link from "next/link";
import { useApiData, DataState, EmptyState } from "@/components/data-state";
import { discoveriesSchema, type Discoveries } from "@/lib/schemas";

function Evidence({ ids, data }: { ids: string[]; data: Discoveries }) {
  return <details><summary>Why am I seeing this?</summary>{data.evidence.filter((e) => ids.includes(e.reflectionId)).map((e) =>
    <div key={e.reflectionId}><blockquote>{e.text}</blockquote><time className="small" dateTime={e.createdAt}>{new Date(e.createdAt).toLocaleString()}</time></div>)}</details>;
}
export default function DiscoveriesPage() {
  const { data, error, loading, reload } = useApiData("/api/discoveries", discoveriesSchema);
  return <>
    <p className="eyebrow">02 / Discover</p><h1>My Discoveries</h1>
    <p className="intro">Small clues from your experiences. These are possibilities to explore, not assessments of your ability.</p>
    <DataState error={error} loading={loading} retry={reload} />
    {data && !loading && !error && (data.hasReflections ? <>
      <section className="panel"><h2>Possible interests</h2><p className="small">Based on {data.reflectionCount} reflection{data.reflectionCount === 1 ? " · Early observations" : "s"}.</p>
        <div className="tags">{data.interests.map((interest) => <span className="tag" key={interest.tag}>{interest.tag}</span>)}</div>
        {!data.interests.length && <p className="muted">Not enough evidence for interest tags yet. Try reflecting on a specific activity you enjoyed or were curious about.</p>}
        {data.observations.map((observation, index) => <div key={index} className="mt-4"><p>{observation.text}</p><Evidence ids={observation.sourceReflectionIds} data={data} /></div>)}
      </section>
      {data.shortInsight && <section className="panel"><p className="eyebrow">AI-generated · Possible observation</p><h2>A clue from a recent reflection</h2><p className="insight">{data.shortInsight}</p><Evidence ids={data.insightReflectionId ? [data.insightReflectionId] : []} data={data} /></section>}
      {!!data.possibleSkills.length && <section className="panel"><h2>Possible strengths to explore</h2><p className="small">Tentative signals from your activities, not verified skills.</p><ul>{data.possibleSkills.map((skill) => <li key={skill}>{skill}</li>)}</ul></section>}
      {!!data.futureDirections.length && <section className="panel"><h2>Possible directions to explore</h2><ul>{data.futureDirections.map((direction) => <li key={direction}>{direction}</li>)}</ul></section>}
      <Link className="button" href="/next-steps">Explore your next steps →</Link>
    </> : <EmptyState />)}
  </>;
}