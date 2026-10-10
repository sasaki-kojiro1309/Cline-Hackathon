"use client";
import type { FeedbackStatus, RecommendationCard } from "@/lib/schemas";

export function OpportunityCard({ card, busy, onFeedback }: { card: RecommendationCard; busy: boolean; onFeedback: (id: string, status: FeedbackStatus) => void }) {
  return <article className="panel opportunity" aria-label={card.title}>
    <p className="category">{card.category.replaceAll("_", " ")}</p>
    {card.isExample && <span className="example">Example opportunity</span>}
    {!card.isExample && <span className="verified">Verified learning resource</span>}
    <h2>{card.title}</h2><p className="muted">{card.description}</p>
    <div className="why"><h3>Why this matches</h3><p>{card.whyMatch}</p></div>
    <h3>Estimated effort</h3><p>{card.estimatedEffort}</p>
    {card.prerequisiteNote && <p className="small">{card.prerequisiteNote}</p>}
    <h3>Next step</h3><p>{card.nextAction}</p>
    {card.url && <a href={card.url} target="_blank" rel="noopener noreferrer">Visit resource ↗</a>}
    {!card.isExample && <p className="small">Source: {card.source}. Details checked {card.verifiedAt}; availability may change.</p>}
    <div className="actions">{card.status === "saved"
      ? <button disabled={busy} onClick={() => onFeedback(card.id, "completed")}>Mark completed</button>
      : <><button disabled={busy} onClick={() => onFeedback(card.id, "saved")}>Save</button><button className="secondary" disabled={busy} onClick={() => onFeedback(card.id, "not_interested")}>Not interested</button></>}
    </div>
  </article>;
}