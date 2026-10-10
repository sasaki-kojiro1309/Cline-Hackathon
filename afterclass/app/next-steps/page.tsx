"use client";
import { useState } from "react";
import { z } from "zod/v4";
import { DataState, EmptyState, useApiData } from "@/components/data-state";
import { OpportunityCard } from "@/components/opportunity-card";
import { feedbackStatusSchema, recommendationsSchema, type FeedbackStatus } from "@/lib/schemas";
import { errorMessage, requestJson } from "@/lib/client-api";
import { ExampleCatalogue } from "@/components/example-catalogue";
import { notifyDataChanged } from "@/lib/data-events";

const feedbackResponseSchema = z.object({ opportunityId: z.string(), status: feedbackStatusSchema });
export default function NextStepsPage() {
  const { data, error, loading, reload } = useApiData("/api/recommendations", recommendationsSchema);
  const [busy, setBusy] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [view, setView] = useState<"suggested" | "browse">("suggested");
  async function feedback(opportunityId: string, status: FeedbackStatus) {
    if (busy) return;
    setBusy(true); setFeedbackError(""); setConfirmation("");
    try {
      await requestJson("/api/feedback", feedbackResponseSchema, { opportunityId, status });
      notifyDataChanged();
      const refreshed = await reload();
      setConfirmation(`${status === "saved" ? "Saved for later" : status === "completed" ? "Marked completed" : "Marked not interested"}. ${refreshed ? "Your suggestions have been updated." : "Feedback was saved; retry loading to see updated suggestions."}`);
    } catch (error) { setFeedbackError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <>
    <p className="eyebrow">03 / Explore</p><h1>Your Next Steps</h1>
    <p className="intro">Turn your interests into small, practical next steps—or explore a new subject. Your suggestions grow with every check-in.</p>
    <div className="discovery-tabs" role="group" aria-label="Next Steps views"><button aria-pressed={view === "suggested"} onClick={() => setView("suggested")}>For you</button><button aria-pressed={view === "browse"} onClick={() => setView("browse")}>Browse ideas</button></div>
    <p className="small">Suggested activities to adapt at your own pace, not confirmed event or course listings. Times are approximate.</p>
    <DataState error={error} loading={loading} retry={reload} />
    {feedbackError && <p className="error" role="alert">{feedbackError} No change was confirmed. Try the action again.</p>}
    <p className="status" role="status">{busy ? "Updating your next steps…" : confirmation}</p>
    {view === "browse" && <ExampleCatalogue busy={busy} onFeedback={feedback} />}
    {view === "suggested" && data && !loading && !error && (data.hasReflections ? <>
      <div className="grid">{data.recommendations.map((card) => <OpportunityCard key={card.id} card={card} busy={busy} onFeedback={feedback} />)}</div>
      {data.latestCheckIn && <p className="small">Matched using your history through {data.latestCheckIn.slice(0, 10)}.</p>}
      {!data.recommendations.length && <p className="muted">No new activities match these interests yet. Browse ideas for inspiration or add a more specific check-in.</p>}
      <section className="mt-8" aria-label="Saved"><h2>Saved</h2>{data.saved.length ? <div className="grid">{data.saved.map((card) => <OpportunityCard key={card.id} card={card} busy={busy} onFeedback={feedback} />)}</div> : <p className="muted">Save an idea you would like to try. It will appear here.</p>}</section>
    </> : <EmptyState />)}
  </>;
}