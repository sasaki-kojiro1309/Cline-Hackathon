"use client";
import { useState } from "react";
import { z } from "zod/v4";
import { DataState, EmptyState, useApiData } from "@/components/data-state";
import { OpportunityCard } from "@/components/opportunity-card";
import { feedbackStatusSchema, recommendationsSchema, type FeedbackStatus } from "@/lib/schemas";
import { errorMessage, requestJson } from "@/lib/client-api";

const feedbackResponseSchema = z.object({ opportunityId: z.string(), status: feedbackStatusSchema });
export default function NextStepsPage() {
  const { data, error, loading, reload } = useApiData("/api/recommendations", recommendationsSchema);
  const [busy, setBusy] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  async function feedback(opportunityId: string, status: FeedbackStatus) {
    if (busy) return;
    setBusy(true); setFeedbackError(""); setConfirmation("");
    try {
      await requestJson("/api/feedback", feedbackResponseSchema, { opportunityId, status });
      const refreshed = await reload();
      setConfirmation(`${status === "saved" ? "Saved for later" : status === "completed" ? "Marked completed" : "Marked not interested"}. ${refreshed ? "Your suggestions have been updated." : "Feedback was saved; retry loading to see updated suggestions."}`);
    } catch (error) { setFeedbackError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <>
    <p className="eyebrow">03 / Explore</p><h1>Your Next Steps</h1>
    <p className="intro">Try something small and see how it feels. Explore labelled examples and verified learning resources. Example campus activities are not scheduled events.</p>
    <DataState error={error} loading={loading} retry={reload} />
    {feedbackError && <p className="error" role="alert">{feedbackError} No change was confirmed. Try the action again.</p>}
    <p className="status" role="status">{busy ? "Updating your next steps…" : confirmation}</p>
    {data && !loading && !error && (data.hasReflections ? <>
      <div className="grid">{data.recommendations.map((card) => <OpportunityCard key={card.id} card={card} busy={busy} onFeedback={feedback} />)}</div>
      {data.recommendations.length < 3 && <p className="muted">No more suggestions in the current example catalogue. {data.recommendations.length} eligible suggestion{data.recommendations.length === 1 ? " remains" : "s remain"}.</p>}
      <section className="mt-8" aria-label="Saved"><h2>Saved</h2>{data.saved.length ? <div className="grid">{data.saved.map((card) => <OpportunityCard key={card.id} card={card} busy={busy} onFeedback={feedback} />)}</div> : <p className="muted">Save an idea you would like to try. It will appear here.</p>}</section>
    </> : <EmptyState />)}
  </>;
}