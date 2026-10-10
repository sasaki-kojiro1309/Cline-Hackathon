"use client";
import type { FeedbackStatus, RecommendationCard } from "@/lib/schemas";

const categoryLabels: Record<RecommendationCard["category"], string> = {
  competition: "Challenge", campus_event: "Campus exploration", project: "Hands-on project",
  research: "Inquiry", learning_resource: "Practice plan", student_community: "Community exploration",
};

export function OpportunityCard({ card, busy, onFeedback }: { card: RecommendationCard; busy: boolean; onFeedback: (id: string, status: FeedbackStatus) => void }) {
  return <article className="panel opportunity" aria-label={card.title}>
    <p className="category">{categoryLabels[card.category]}</p>
    <span className="example">Exploration idea</span>
    <h2>{card.title}</h2><p className="muted">{card.description}</p>
    <details className="why"><summary>Why try this?</summary><p>{card.whyMatch}</p></details>
    <p className="small">Approximate time: {card.estimatedEffort}</p>
    {card.prerequisiteNote && <p className="small">{card.prerequisiteNote}</p>}
    <h3>Next step</h3><p>{card.nextAction}</p>
    <div className="actions">{card.status === "saved"
      ? <button disabled={busy} onClick={() => onFeedback(card.id, "completed")}>Mark completed</button>
      : card.status === "completed" ? <p className="status">Completed</p>
      : card.status === "not_interested" ? <><p className="small">Marked not interested</p><button className="secondary" disabled={busy} onClick={() => onFeedback(card.id, "saved")}>Save instead</button></>
      : <><button disabled={busy} onClick={() => onFeedback(card.id, "saved")}>Save</button><button className="secondary" disabled={busy} onClick={() => onFeedback(card.id, "not_interested")}>Not interested</button></>}
    </div>
  </article>;
}