"use client";
import Link from "next/link";
import { useState } from "react";
import { useApiData, DataState, EmptyState } from "@/components/data-state";
import { JourneySummaryPanel, ReflectionHistory, JourneyEvidence } from "@/components/journey-panels";
import { rangeInputSchema, type RangeInput, type Signal } from "@/lib/journey";
import { discoveriesSchema, type Discoveries } from "@/lib/schemas";

function Evidence({ ids, data }: { ids: string[]; data: Discoveries }) {
  return <details><summary>Why am I seeing this?</summary>{data.evidence.filter((e) => ids.includes(e.reflectionId)).map((e) =>
    <div key={e.reflectionId}><blockquote>{e.text}</blockquote><time className="small" dateTime={e.createdAt}>{e.createdAt.slice(0, 10)} (UTC)</time></div>)}</details>;
}
function SignalGroup({ title, items }: { title: string; items: Signal[] }) {
  if (!items.length) return null;
  return <section className="panel"><h2>{title}</h2>{items.slice(0, 4).map((s) => <div className="signal-row" key={s.tag}><h3>{s.tag}</h3><p className="small">{s.dayCount} distinct day{s.dayCount === 1 ? "" : "s"} · {s.count} reflection{s.count === 1 ? "" : "s"}</p><JourneyEvidence ids={s.sourceReflectionIds} /></div>)}</section>;
}
const tabs = ["Overview", "Patterns", "History"] as const;
export default function DiscoveriesPage() {
  const [selection, setSelection] = useState<RangeInput>({ range: "all" }), [tab, setTab] = useState<typeof tabs[number]>("Overview");
  const [range, setRange] = useState<RangeInput["range"]>("all"), [start, setStart] = useState(""), [end, setEnd] = useState(""), [rangeError, setRangeError] = useState("");
  const query = new URLSearchParams(selection as Record<string, string>).toString();
  const { data, error, loading, reload } = useApiData(`/api/discoveries?${query}`, discoveriesSchema);
  const journey = data?.journey;
  function applyRange(event: React.FormEvent) {
    event.preventDefault();
    const result = rangeInputSchema.safeParse({ range, ...(range === "custom" ? { start, end } : {}) });
    if (!result.success) { setRangeError("Choose a valid start and end date."); return; }
    setRangeError(""); setSelection(result.data);
  }
  return <>
    <div className="page-heading"><div><p className="eyebrow">02 / Discover</p><h1>My Discoveries</h1><p className="intro">What your experiences suggest—and what you might explore next.</p></div><Link className="button" href="/">New check-in</Link></div>
    <form className="discovery-toolbar" onSubmit={applyRange}><div><label htmlFor="journey-range">Date range</label><select id="journey-range" value={range} onChange={(e) => setRange(e.target.value as RangeInput["range"])}><option value="all">All time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="custom">Custom range</option></select></div>
      {range === "custom" && <><div><label htmlFor="range-start">Start date</label><input id="range-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div><div><label htmlFor="range-end">End date</label><input id="range-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div></>}
      <button className="secondary">Apply date range</button>{rangeError && <p className="error" role="alert">{rangeError}</p>}
    </form>
    <div className="discovery-tabs" role="tablist" aria-label="Discovery views">{tabs.map((name, i) => <button key={name} id={`discovery-tab-${name}`} role="tab" aria-selected={tab === name} aria-controls="discovery-content" tabIndex={tab === name ? 0 : -1}
      onClick={() => setTab(name)} onKeyDown={(e) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) { e.preventDefault(); const next = e.key === "Home" ? 0 : e.key === "End" ? 2 : (i + (e.key === "ArrowRight" ? 1 : 2)) % 3; setTab(tabs[next]); document.getElementById(`discovery-tab-${tabs[next]}`)?.focus(); } }}>{name}</button>)}</div>
    <DataState error={error} loading={loading} retry={reload} />
    {data && !loading && !error && <div id="discovery-content" role="tabpanel" aria-labelledby={`discovery-tab-${tab}`}>
      {!data.hasReflections ? data.historyCount ? <section className="panel"><h2>No reflections in this date range</h2><p>Choose a wider period to explore your history.</p></section> : <EmptyState /> : <>
        <p className="small discovery-context">Based on {data.reflectionCount} reflection{data.reflectionCount === 1 ? "" : "s"}{journey ? ` across ${journey.activeDays} days` : ""} · Dates in UTC · Updated through {journey?.lastDate ?? "your latest check-in"}</p>
        {tab === "Overview" && <>
          <section className="panel"><h2>Possible interests</h2>{!data.interests.length ? <p className="muted">Your check-ins do not show clear interests yet. Try describing a specific activity you enjoyed or want to explore.</p> : <div className="interest-grid">{data.interests.map((interest) => {
            const signal = journey?.signals.interests.find((s) => s.tag === interest.tag);
            return <div className="interest-card" key={interest.tag}><h3>{interest.tag}</h3><p className="small">{signal?.dayCount ?? 1} day{signal?.dayCount === 1 ? "" : "s"} · {interest.count} mention{interest.count === 1 ? "" : "s"}</p><Evidence ids={interest.sourceReflectionIds} data={data} /></div>;
          })}</div>}</section>
          {data.shortInsight && <section className="panel"><p className="eyebrow">Latest check-in · AI observation</p><h2>What stood out</h2><p className="insight">{data.shortInsight}</p><Evidence ids={data.insightReflectionId ? [data.insightReflectionId] : []} data={data} /></section>}
          {journey && <details className="panel optional-summary"><summary>Combined journey summary</summary><JourneySummaryPanel key={query} selection={selection} query={query} activeDays={journey.activeDays} /></details>}
          <div className="discovery-next"><p>Turn a supported interest into a small experiment.</p><Link className="button" href="/next-steps">Explore your next steps →</Link></div>
        </>}
        {tab === "Patterns" && <>
          <section className="panel"><h2>Recurring themes</h2>{data.observations.map((item, i) => <div key={i}><p>{item.text}</p><Evidence ids={item.sourceReflectionIds} data={data} /></div>)}{!data.observations.length && <p>More specific check-ins may help reveal patterns.</p>}</section>
          {journey && <>
            <div className="pattern-grid"><SignalGroup title="Enjoyed experiences" items={journey.signals.enjoyed} /><SignalGroup title="Curiosities" items={journey.signals.curiosities} /><SignalGroup title="Challenges" items={journey.signals.disliked} /><SignalGroup title="Skills you could explore" items={journey.signals.possible_skills} /></div>
            {!!journey.mixedExperiences.length && <section className="panel"><h2>Mixed experiences</h2>{journey.mixedExperiences.map((item) => <div key={item.tag}><p>{item.text}</p><JourneyEvidence ids={item.sourceReflectionIds} /></div>)}</section>}
          </>}
          {!!data.themeChanges.length && <section className="panel"><h2>Changing themes</h2>{data.themeChanges.map((theme) => <div key={theme.tag}><p>{theme.description}</p><Evidence ids={theme.sourceReflectionIds} data={data} /></div>)}</section>}
          {journey && journey.weeks.length > 1 && <details className="panel"><summary>Weekly overview</summary><p className="small">Latest {journey.weeks.length} active weeks, Monday–Sunday (UTC).</p>{journey.weeks.map((week) => <details key={week.start}><summary>{week.start}–{week.end} · {week.dayCount} days</summary><div className="tags">{week.interests.map((s) => <span className="tag" key={s.tag}>{s.tag}</span>)}</div>{week.curiosities.length > 0 && <p>Curious about: {week.curiosities.map((s) => s.tag).join(", ")}</p>}{week.challenges.length > 0 && <p>Challenges: {week.challenges.map((s) => s.tag).join(", ")}</p>}</details>)}</details>}
          {journey?.prompts.length && <details className="panel"><summary>Questions for your next check-in</summary><ul>{journey.prompts.slice(0, 3).map((prompt) => <li key={prompt}>{prompt}</li>)}</ul><Link href="/">Write a check-in →</Link></details>}
        </>}
      </>}
      {tab === "History" && data.historyCount > 0 && <ReflectionHistory key={query} query={query} />}
    </div>}
    <p className="small">These are clues from your reflections, not assessments of ability or a career verdict.</p>
  </>;
}