"use client";
import { useState } from "react";
import { catalogueResponseSchema, type FeedbackStatus } from "@/lib/schemas";
import { useApiData, DataState } from "./data-state";
import { OpportunityCard } from "./opportunity-card";

export function ExampleCatalogue({ busy, onFeedback }: { busy: boolean; onFeedback: (id: string, status: FeedbackStatus) => void }) {
  const [subject, setSubject] = useState(""), [query, setQuery] = useState(""), [search, setSearch] = useState(""), [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApiData(`/api/catalogue?subject=${encodeURIComponent(subject)}&q=${encodeURIComponent(query)}&page=${page}`, catalogueResponseSchema);
  return <section aria-label="Exploration catalogue">
    <p className="small">{data ? `${data.catalogueTotal} exploration ideas across ${data.subjects.length} subjects and areas.` : "Explore projects, inquiries, practice plans and group activities."} Find a starting point and make it your own.</p>
    <form className="discovery-toolbar" onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(search); }}>
      <div><label htmlFor="activity-subject">Subject or area</label><select id="activity-subject" value={subject} onChange={(e) => { setPage(1); setSubject(e.target.value); }}><option value="">All subjects</option>{data?.subjects.map((tag) => <option key={tag} value={tag}>{tag}</option>)}</select></div>
      <div><label htmlFor="activity-search">Search activities</label><input id="activity-search" maxLength={200} value={search} onChange={(e) => setSearch(e.target.value)} /></div><button className="secondary">Find ideas</button>
    </form>
    <DataState error={error} loading={loading} retry={reload} />
    {data && !loading && !error && <>
      <p className="small">{data.total} matching activities · Page {page} of {Math.max(1, Math.ceil(data.total / data.pageSize))}</p>
      {!data.activities.length && <p className="muted">No activities match these filters. Try a wider subject or search.</p>}
      <div className="grid">{data.activities.map((card) => <OpportunityCard key={card.id} card={card} busy={busy} onFeedback={onFeedback} />)}</div>
      <div className="actions"><button className="secondary" disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>Previous page</button><button className="secondary" disabled={loading || page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next page</button></div>
    </>}
  </section>;
}