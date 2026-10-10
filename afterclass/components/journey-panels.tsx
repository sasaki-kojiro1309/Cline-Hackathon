"use client";
import { useState } from "react";
import { DataState, useApiData } from "./data-state";
import { errorMessage, requestJson } from "@/lib/client-api";
import { historySchema, summaryStateSchema, type RangeInput } from "@/lib/journey";

export function JourneyEvidence({ ids }: { ids: string[] }) {
  const [open, setOpen] = useState(false);
  return <details onToggle={(e) => setOpen(e.currentTarget.open)}><summary>Supporting reflections</summary>
    {open && ids.map((id) => <EvidenceEntry key={id} id={id} />)}</details>;
}
function EvidenceEntry({ id }: { id: string }) {
  const { data, error, loading, reload } = useApiData(`/api/reflections?id=${encodeURIComponent(id)}`, historySchema);
  return <div><DataState loading={loading} error={error} retry={reload} />{data?.reflections.map((r) => <div key={r.id}><blockquote>{r.text}</blockquote><time dateTime={r.createdAt} className="small">{r.createdAt.slice(0, 10)} (UTC)</time></div>)}</div>;
}
export function JourneySummaryPanel({ selection, query, activeDays }: { selection: RangeInput; query: string; activeDays: number }) {
  const { data, error, loading, reload } = useApiData(`/api/journey?${query}`, summaryStateSchema);
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [failure, setFailure] = useState("");
  const current = data;
  async function analyze(refresh = false) {
    if (busy || !consent) return;
    setBusy(true); setFailure("");
    try { await requestJson("/api/journey", summaryStateSchema, { selection, consent: true, refresh }); await reload(); }
    catch (error) { setFailure(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <section className="panel" aria-label="Combined AI summary">
    <p className="eyebrow">Optional AI analysis</p><h2>Your combined journey</h2>
    <p className="small">Combine the clues across your check-ins. This optional request sends aggregate signals and up to 30 representative excerpts to {current?.providerLabel ?? "your configured AI service"} and may use API credits.</p>
    <DataState loading={loading} error={error} retry={reload} />
    {current?.status === "stale" && <p className="status">Your previous summary is out of date. Generate a new one for the current data and configuration.</p>}
    {current?.summary && <>
      <p className="small">Updated {current.generatedAt?.slice(0, 10)} · Based on {current.reflectionCount} reflections</p>
      <p className="insight">{current.summary.overview.text}</p><JourneyEvidence ids={current.summary.overview.sourceReflectionIds} />
      <h3>Possible patterns</h3>{current.summary.patterns.map((item, i) => <div key={i}><p>{item.text}</p><JourneyEvidence ids={item.sourceReflectionIds} /></div>)}
      <h3>Small next steps</h3>{current.summary.nextSteps.map((item, i) => <div key={i}><p>{item.text}</p><JourneyEvidence ids={item.sourceReflectionIds} /></div>)}
    </>}
    {activeDays < 2 && <p className="muted">Reflections on at least two different UTC days are needed for a combined AI summary.</p>}
    <label className="consent"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={busy} />I consent to sending this period&apos;s aggregate signals and representative reflection excerpts to the selected AI service.</label>
    {failure && <p className="error" role="alert">{failure}</p>}
    <div className="actions"><button disabled={busy || !consent || activeDays < 2 || loading} onClick={() => analyze()}>{busy ? "Analyzing your journey…" : "Analyze my journey"}</button>
      {current?.status === "fresh" && <button className="secondary" disabled={busy || !consent} onClick={() => analyze(true)}>Regenerate summary</button>}</div>
  </section>;
}
export function ReflectionHistory({ query }: { query: string }) {
  const [page, setPage] = useState(1), [search, setSearch] = useState(""), [term, setTerm] = useState("");
  const { data, error, loading, reload } = useApiData(`/api/reflections?${query}&page=${page}&q=${encodeURIComponent(term)}`, historySchema);
  return <section className="panel" aria-label="Reflection history"><h2>Your reflection history</h2>
    <p className="small">Search all retained entries in this date range. Dates are grouped in UTC; each page contains at most 20 entries.</p>
    <form onSubmit={(e) => { e.preventDefault(); setPage(1); setTerm(search); }}><label htmlFor="history-search">Search reflection text</label><input id="history-search" value={search} maxLength={200} onChange={(e) => setSearch(e.target.value)} /><button className="secondary">Search history</button></form>
    <DataState loading={loading} error={error} retry={reload} />
    {data && !loading && !error && <><p className="small">{data.total} matching reflection{data.total === 1 ? "" : "s"} · Page {page} of {Math.max(1, Math.ceil(data.total / data.pageSize))}</p>
      {data.reflections.map((entry) => <details key={entry.id}><summary>{entry.createdAt.slice(0, 10)} — {entry.text.slice(0, 70)}{entry.text.length > 70 ? "…" : ""}</summary><blockquote>{entry.text}</blockquote></details>)}
      <div className="actions"><button className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous page</button><button className="secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next page</button></div></>}
  </section>;
}