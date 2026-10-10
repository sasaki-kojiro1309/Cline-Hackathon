# AfterClass — Scope Document

## 1. Overview

**AfterClass** is an AI-powered student discovery and opportunity platform. It turns everyday classroom experiences into a personalized view of a student's interests, possible skills, future directions, and opportunities worth exploring.

Students write short reflections after classes, labs, projects, or events. The platform identifies recurring signals in those reflections and uses them to recommend relevant opportunities.

**Core principle:** Reflect → Discover → Explore → Learn what fits.

AfterClass is intended to help students explore possibilities. It does not claim to identify a student's perfect career.

## 2. Problem Statement

Students may discover what they enjoy through everyday academic experiences, but they do not always know how to turn those experiences into meaningful next steps. AfterClass connects those experiences to relevant opportunities and possible future directions.

## 3. Objective

Build a focused MVP that demonstrates one complete student journey:

1. A student records a short reflection.
2. The platform extracts possible interests and related signals.
3. The student sees the patterns identified in their reflections.
4. The platform recommends relevant next steps and explains why they match.
5. Student feedback can influence subsequent recommendations.

## 4. Intended User

The primary user is a student who wants to understand what interests them and discover related opportunities or future directions.

## 5. Scope of the 8-Hour Hackathon MVP

The MVP will consist of **three main screens** connected by a navigation bar. It should demonstrate one complete, convincing journey rather than attempt to implement every feature of the broader idea.

### Screen 1 — Daily Check-in

- Provide a simple text box for a natural-language reflection.
- Show three optional prompts:
  - What did you enjoy today?
  - What felt boring, difficult, or frustrating?
  - What made you curious? / Is there anything you'd like to try yourself?
- Include a **“Find my insights”** action.
- Keep the reflection short and avoid a lengthy questionnaire.

### Screen 2 — My Discoveries

- Display three or four inferred interest tags.
- Show patterns from reflections and a short AI-generated insight.
- Present a few possible future directions.
- Make it possible to see the experiences behind an insight.
- Present interests and possible skills as tentative observations, not proven assessments.

### Screen 3 — Your Next Steps

- Display three personalized opportunity cards.
- Each card includes a reason for the match, an estimated time commitment, and a next step or link.
- Include **Save** and **Not interested** actions.
- Recommendations may represent competitions, hackathons, campus events, student clubs, research projects, learning resources, or small self-guided challenges.

Separate pages for each type of opportunity are not required.

## 6. Core User Journey

1. **Reflect:** The student enters a short reflection about a class, lab, project, or event.
2. **Discover:** The AI extracts signals such as what the student enjoyed, disliked, found interesting, or wants to try.
3. **Explore:** The platform shows interest themes and possible future directions.
4. **Take a next step:** The platform recommends opportunities and explains the connection to the student's reflection.
5. **Give feedback:** Saving, dismissing, or marking an opportunity completed can influence what is recommended next.

## 7. AI and Recommendation Scope

The AI pipeline should remain deliberately simple. The language model extracts meaning from reflections; it does not invent the platform or the opportunity catalogue.

### 7.1 Extract structured signals

For each reflection, ask the language model to return structured data resembling:

```json
{
  "enjoyed": ["hands-on building", "logic puzzles"],
  "disliked": ["rote memorization"],
  "interests": ["digital systems", "computer architecture"],
  "possible_skills": ["logical reasoning"],
  "curiosities": ["building a processor"]
}
```

These signals are tentative interpretations of the student's own words.

### 7.2 Maintain an opportunity catalogue

Create a small seed catalogue of **20–30 opportunities** in JSON. Each entry should include:

- Title
- Category
- Description
- Relevant interests
- Required skills
- Estimated effort
- Link or next action

The catalogue should include representative entries for competitions, campus events, projects, learning resources, and student communities.

Simulated opportunities must be clearly labelled as examples. Actual events should only be presented as verified after their details have been checked.

### 7.3 Rank opportunities

Use straightforward tag matching rather than a complicated recommendation model. Consider:

- Overlap with the student's interests
- Available time
- Prerequisites
- Student feedback

### 7.4 Explain each match

Generate a short explanation based on the student's extracted signals and the selected opportunity's actual description. The platform should show why an opportunity is relevant rather than merely presenting popular opportunities to everyone.

When a student saves, dismisses, or marks an opportunity completed, use that feedback to update subsequent recommendations.

## 8. Scope Boundaries and Principles

- The MVP focuses on the three screens and the complete student journey described in this document.
- Use simple tag matching for the initial recommendation system; a complicated recommendation model is not part of this MVP.
- Use the language model to extract and explain signals, not to invent opportunities.
- Do not present interest signals as scientifically validated scores or proof of ability.
- Do not claim to know a student's perfect career; present future directions as possibilities to explore.
- Clearly distinguish simulated example opportunities from verified real events.

## 9. MVP Completion Criteria

The MVP demonstrates the intended journey when a student can:

- Enter a free-text reflection and request insights.
- See inferred interest tags, patterns, an AI-generated insight, and possible future directions.
- View three opportunity recommendations.
- Understand why each recommendation matches their reflection.
- See the estimated effort and next step for each recommendation.
- Save an opportunity or mark it as not interesting, with that feedback considered by subsequent recommendations.

## 10. Expected Outcome

A working demonstration of AfterClass that connects a student's everyday academic experiences to visible interest patterns and personalized next steps, while making the reasoning behind recommendations understandable.
