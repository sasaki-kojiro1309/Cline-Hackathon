# AfterClass — Discover what drives you

**Turn everyday learning experiences into clues about your interests—and small, practical next steps.**

AfterClass is a student reflection and exploration app built with Cline. Its core journey is:

**Reflect → Discover → Explore → Learn what fits.**

This repository contains a working local prototype. Follow the setup below to run it; there is no hosted demo documented here.

**Jump to:** [Judge setup](#run-it-locally--judge-setup) · [Demo walkthrough](#suggested-judge-walkthrough--about-five-minutes) · [Architecture](#architecture) · [Tech stack](#tech-stack) · [Cline's role](#how-cline-was-used-in-the-build)

## The problem

Students often learn something important about themselves during a class, lab, project, or event: they enjoy building something, become curious about a topic, or find a task frustrating. Those moments are easy to forget, and a list of courses or career options does not explain what to do with them.

AfterClass connects those everyday experiences to an evolving record of interests and achievable activities. It helps students explore possibilities—not choose a supposedly perfect career or receive an ability score.

## Our solution

Three connected screens turn reflection into action:

| Screen | What a student can do |
| --- | --- |
| **Daily Check-in** | Write a short reflection, consent to AI processing, and request tentative insights about interests, enjoyed experiences, challenges, curiosities, and possible skills. |
| **My Discoveries** | Review interests and recurring or mixed experiences, inspect supporting reflections, filter by date, and search retained history. Optionally request a combined AI journey summary. |
| **Your Next Steps** | View personalized **For you** suggestions or **Browse ideas** from 100 static activities across 54 subjects and areas. Search, filter, save, dismiss, or mark saved activities completed. |

Each activity includes a practical next action, **Approximate time**, and **Why try this?** Personal suggestions explain their connection to the student's reflections; browsing does not pretend to be personalized.

### What makes the approach different

- **Evidence before labels:** discoveries link back to the student's own reflections; observations remain tentative.
- **A journey, not a one-off quiz:** retained history supports patterns across distinct days, date filters, and searchable entries.
- **Explainable recommendations:** local tag matching and feedback rank existing activities. The model does not invent the catalogue.
- **Broad exploration:** projects, inquiries, practice plans, challenges, and community activities cover sciences, humanities, arts, technology, and more.
- **Honest activity data:** ideas are starting points to adapt, not verified events, course listings, or external-resource recommendations. There is no live web search or automatic external updating.
- **Student control:** accounts keep histories separate; AI requests require consent; students can export or delete their app data.

## Run it locally — judge setup

### Prerequisites

- **Node.js 24+** and npm. Node's built-in SQLite module is used; no separate database installation is needed.
- Git, or a downloaded copy of this repository.
- For the complete reflection-to-insights demo: internet access and an API key with access/quota for a supported AI model. API calls may incur provider charges.

No Supabase project, email service, or Cline installation is needed to run the app. **Cline was the development tool, not a runtime dependency.**

### 1. Install

```bash
git clone https://github.com/sasaki-kojiro1309/Cline-Hackathon.git
cd Cline-Hackathon/afterclass
node --version
npm ci
```

If you already have the repository, start in its `afterclass` directory instead of cloning again.

### 2. Create the local configuration

On macOS/Linux:

```bash
cp -n .env.example .env.local
```

On Windows PowerShell:

```powershell
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
```

Edit `.env.local`. Keep existing working credentials if the file already exists. For an OpenAI demo, set:

```dotenv
STORAGE_PROVIDER=local
DATA_RETENTION_DAYS=0
AI_PROVIDER=openai
AI_MODEL=gpt-4o-mini
```

Then set **`AI_API_KEY` to your own provider API key** in that file. Do not commit or share it. The selected model must be available to your account and support the provider's structured JSON output. For OpenAI, the app uses the Responses API with Structured Outputs; a ChatGPT subscription alone does not provide API credits.

Other supported configurations:

| Provider | `AI_PROVIDER` | Configuration |
| --- | --- | --- |
| OpenAI | `openai` | `AI_API_KEY` + `AI_MODEL`; legacy `OPENAI_API_KEY` + `OPENAI_MODEL` also work. |
| Google Gemini | `gemini` | `AI_API_KEY` + `AI_MODEL` for a model supporting structured JSON output. |
| Anthropic Claude | `anthropic` | `AI_API_KEY` + `AI_MODEL` for a model supporting structured JSON output. |
| OpenAI-compatible service | `openai-compatible` | `AI_API_KEY`, `AI_MODEL`, a trusted HTTPS `AI_BASE_URL`, and `AI_OUTPUT_MODE=json_schema` or `json_object`. Provider/model compatibility is required. |

Only the selected provider is used; there is no automatic provider fallback. See [the environment template](./afterclass/.env.example) for all settings.

### 3. Check and start

```bash
npm run check:config
npm run dev
```

Open **http://localhost:3000**. The configuration check prints presence checks only: it does not contact the provider or verify credentials, model access, or API credits. Restart the server after editing `.env.local`.

On Windows, use `npm.cmd` instead of `npm` if PowerShell blocks npm's script wrapper.

### 4. Create your demo account

Choose **Create account**, enter a unique Login ID and a password of **12–128 characters**, confirm it, and optionally add a display name. Login IDs are case-insensitive and use 3–32 letters, numbers, underscores, or hyphens.

There are no shared demo credentials or guest accounts. Remember your credentials: password recovery is not implemented. SQLite creates the account and data tables automatically under `afterclass/.afterclass`.

### No API key? You can still inspect part of the solution

Start the app and create an account, then open **Your Next Steps → Browse ideas**. Search, subject filters, pagination, and catalogue feedback work without external AI calls. Existing saved discoveries also remain readable without an AI key.

However, **new reflections are saved only after successful AI analysis**. Without a working key/model, the app shows an error and retains the draft in the current page; it does not produce fake insights. Automated tests below exercise successful AI flows with mocked provider responses, but those are not a live AI demo.


## Architecture

One Next.js application serves the UI and API. SQLite stores account-owned data; an external AI service is used only for explicit analysis requests.

```text
Browser: Check-in / Discoveries / Next Steps / Account & privacy
                         |
                         v
Next.js route handlers: session checks, same-origin writes, Zod validation,
                        rate limits, controlled error responses
          |                       |                         |
          v                       v                         v
Local SQLite             AI analysis adapter        Local discovery + ranking
accounts, sessions,      selected provider only     stored reflection signals
reflections, analyses,   consented requests         + static activity catalogue
profiles, feedback       validated JSON output      + saved/dismissed feedback
```

### Data flow

1. The server resolves the student's account from an HTTP-only session cookie; student-data APIs do not trust a browser-supplied owner ID.
2. A consented check-in is validated, analyzed server-side, and checked against a structured schema. Only a successful analysis is persisted with its reflection.
3. Discoveries aggregate stored signals locally, count distinct UTC days, and expose supporting reflection evidence. Ordinary viewing does not request new AI analysis.
4. Recommendations rank the static catalogue using interests, recent curiosities, tentative skill signals, explicitly stated time availability, and feedback. Saved, dismissed, and completed entries are excluded from fresh suggestions; saved items have their own section.
5. Feedback is persisted and influences later ranking. Browsing and recommendation generation make **no external service requests**.

### Code map

| Location | Responsibility |
| --- | --- |
| [`afterclass/app`](./afterclass/app) | Three screens, shared layout, and API route handlers. |
| [`afterclass/components`](./afterclass/components) | Account gate, forms, evidence panels, activity cards, and catalogue browser. |
| [`lib/ai.ts`](./afterclass/lib/ai.ts), [`lib/ai-providers.ts`](./afterclass/lib/ai-providers.ts) | Structured analysis, provider configuration, retries, and safe error handling. |
| [`lib/discoveries.ts`](./afterclass/lib/discoveries.ts), [`lib/journey.ts`](./afterclass/lib/journey.ts) | History aggregation, date ranges, evidence, and journey summaries. |
| [`lib/recommendations.ts`](./afterclass/lib/recommendations.ts), [`lib/catalogue-browser.ts`](./afterclass/lib/catalogue-browser.ts) | Deterministic ranking, feedback, filtering, and pagination. |
| [`data`](./afterclass/data), [`lib/catalogue.ts`](./afterclass/lib/catalogue.ts) | Static activities and catalogue validation. |
| [`lib/accounts.ts`](./afterclass/lib/accounts.ts), [`lib/sqlite-db.ts`](./afterclass/lib/sqlite-db.ts) | Password accounts, revocable sessions, SQLite schema, and transactions. |
| [`tests`](./afterclass/tests) | Unit/API tests and desktop/mobile browser journeys. |

## Tech stack

| Layer | Technology |
| --- | --- |
| Web framework | **Next.js 16.4**, App Router, server-side route handlers, Turbopack. |
| UI | **React 19.3**, TypeScript, **Tailwind CSS 4** and custom responsive CSS. |
| Runtime and persistence | **Node.js 24+**, built-in `node:sqlite`, local SQLite with WAL and transactions. |
| Authentication | Node `crypto` scrypt password hashing, random session tokens stored as hashes, HTTP-only cookies. |
| Validation | **Zod 4** for request, AI response, catalogue, and API schemas. |
| AI integration | OpenAI SDK; server-side HTTP adapters for Gemini, Claude, and OpenAI-compatible services. |
| Quality checks | **Vitest**, **Playwright** desktop/mobile tests, ESLint, TypeScript, production build. |
| Development assistance | **Cline in VS Code** for implementation, iteration, debugging, and validation. |

Supabase dependencies and migrations remain from earlier engineering work, but cloud accounts are **not enabled** in this version. The runnable solution uses local SQLite.

## How Cline was used in the build

Cline was used as a coding agent in an iterative **plan → implement → run → inspect → fix** workflow, with human direction on product scope, copy, design, and credentials.

| Build activity | Cline's contribution |
| --- | --- |
| Planning | Worked from the [scope document](./ScopeDocument.md) and [phase-by-phase implementation blueprint](./CLINE_AFTERCLASS_IMPLEMENTATION.md), inspecting the repository before changes. |
| Implementation | Assisted with the three-screen journey, structured AI analysis, catalogue ranking, persistent accounts/history, and privacy controls. |
| Product iteration | Helped expand the static catalogue, remove live web-data features, and replace event-like wording with natural exploration-focused copy. |
| Testing | Wrote and updated unit/API and desktop/mobile browser assertions, ran checks, and used failures to guide fixes. |
| Debugging | Reproduced continuous page reloading in a clean Playwright browser, identified Next.js HMR hash-mismatch messages, rebuilt the dev cache, isolated the browser-test build cache, and added page-stability regression tests. |
| Documentation | Helped document configuration, demo steps, architecture, and the limits of what had been tested. |

The scope and blueprint capture the intended workflow, not proof that every original design choice shipped unchanged. The current implementation and tests are the source of truth. Cline-assisted development is also separate from the app's runtime AI: students use the configured provider, not Cline, to analyze reflections.

## Testing and verification

Run these commands from `afterclass`:

```bash
npm run typecheck
npm run lint
npm run test
npx playwright install chromium
npm run test:e2e
npm run build
```

- Unit/API tests cover analysis validation, accounts, session expiry/revocation, student isolation, SQLite persistence, privacy, discovery aggregation, ranking, and catalogue behavior.
- Browser tests cover the student journey, successful and failed AI paths, history and filters, catalogue feedback, page stability, and responsive desktop/mobile rendering.
- Successful AI paths in automated tests use **mocked provider responses**. Local account browser tests use a real, isolated SQLite database. Passing them is not proof of live provider access.
- Playwright starts its own server on port **3100**, uses a temporary data directory, and keeps its build cache in `.next-e2e`, separate from the normal server's `.next` cache. Keep port 3100 free.
- `/api/health` checks catalogue and storage readiness, not AI billing or model access.

`npm run test:live` is a separate, opt-in smoke test that consumes API credits and creates a test account. It is not needed for judging; use it only on an authorized local/staging instance. See [operations guidance](./afterclass/DEPLOYMENT.md).

## Next Steps

- **Local-first is not fully offline:** account data lives on the running server, but consented reflection/journey analysis sends text to the selected AI provider. Use fictional, non-sensitive demo reflections.
- Passwords are salted and hashed; sessions are revocable. Student data is **not encrypted at rest**. Do not treat this as a production-ready identity system.
- `DATA_RETENTION_DAYS=0` retains history until deletion. Positive values enable on-access expiry. Export/deletion applies to app data; deleting data keeps the Login ID/password account and does not erase provider copies or backups.
- Combined AI summaries are cached in memory for up to an hour and are not durable across server restarts. Stored reflections and feedback are durable while the local database is retained.
- Activity ideas are static, not confirmed opportunities. There is no live search, external-resource verification, or scheduled updating.
- There is no password recovery, cloud synchronization, or active Supabase login. Hosting needs a persistent-disk Node server; the current SQLite version is not suitable for Vercel's ephemeral/serverless storage.
- A public release would need security review, recovery/account-deletion policies, student consent policies, backup/restore testing, monitoring, and provider spending controls.

### Troubleshooting

| Symptom | What to check |
| --- | --- |
| AI is not configured / access denied | Check provider, key, model access, and API credits in `.env.local`, then restart. A failed analysis does not save a reflection. |
| No personalized suggestions yet | Submit a specific reflection with working AI, or use Browse ideas. Unsupported matches are not invented. |
| Journey analysis is disabled | Add reflections on two distinct UTC days and grant the separate journey consent. |
| Page keeps reloading with **HMR hash mismatch** | Stop the dev server, delete only `.next/dev`, then restart. macOS/Linux: `rm -rf .next/dev`; PowerShell: `Remove-Item .next/dev -Recurse -Force`. Do not delete `.afterclass` or `.env.local`, and do not run two ordinary dev servers against the same build cache. |

Further reading: [app setup and technical reference](./afterclass/README.md) · [operation and hosting](./afterclass/DEPLOYMENT.md) · [original product scope](./ScopeDocument.md).
