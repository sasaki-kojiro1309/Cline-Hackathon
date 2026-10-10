# AfterClass — minimal local-first prototype

AfterClass connects a short student reflection to tentative interests and small
next steps. It has exactly three screens: **Daily Check-in**, **My Discoveries**,
and **Your Next Steps**. A configured AI provider extracts structured signals;
discoveries show the actual supporting reflections; a deterministic matcher selects three
opportunities from a static 24-item JSON catalogue.

This is the reduced prototype requested by the operator, not the entire
implementation blueprint. **Local JSON file persistence replaces Supabase** by
agreement. Save, Not interested and Mark completed are persisted and influence
subsequent rankings. No accounts, fourth screen, scraping, real scheduled
events, notifications, scores or career assessments are included.

## Requirements and start

- Node.js **24 LTS** and npm (tested with Node 24.21.0 / npm 11.19.0).
- An API key for OpenAI, Google Gemini, Anthropic Claude, or an OpenAI-compatible
  service (including Groq and OpenRouter), plus an available model supporting the
  selected JSON output mode. Provider support does not imply every model works
  or that free credits are included.
- One local Node server with a writable disk. No database or migration is needed.

```bash
cd /Users/mac_m5/Documents/GitHub/Cline-Hackathon/afterclass
npm install
cp .env.example .env.local
# Edit .env.local locally: set AI_PROVIDER, AI_API_KEY and AI_MODEL.
# Do not paste keys in chat, expose them with NEXT_PUBLIC_, or commit them.
npm run dev
```

Open **http://localhost:3000**. If Node/npm is missing from PATH on this machine:

```bash
export PATH="/Users/mac_m5/.nvm/versions/node/v24.21.0/bin:$PATH"
```

Restart the server after changing environment variables. Without an AI key,
the screens, empty states and navigation work, but reflection submission shows
an actionable configuration error. **No fake AI result is substituted.**

### Environment

| Variable | Purpose |
| --- | --- |
| `AI_PROVIDER` | `openai` (default), `gemini`, `anthropic`, or `openai-compatible`. |
| `AI_API_KEY` | Selected provider's key; server-only. |
| `AI_MODEL` | Model available to that provider/account; no automatic model selection. |
| `AI_BASE_URL` | Required only for compatible APIs; trusted HTTPS base URL, including its API version path. No query, fragment or embedded credentials. |
| `AI_OUTPUT_MODE` | Compatible APIs only: `json_schema` (default) or `json_object`. |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Legacy fallback only for `openai`, when the corresponding generic setting is empty. |
| `SESSION_SIGNING_SECRET` | Optional secret of at least 32 bytes. Otherwise generated and persisted automatically. |
| `AFTERCLASS_DATA_DIR` | Optional absolute directory; defaults to this app's `.afterclass`. |

`.env.local`, local student data and browser reports are gitignored.
The signing secret is generated without printing it.

### Selecting an AI provider

Edit `.env.local` locally and restart `npm run dev`. Never paste keys into chat.
Keys are not detected automatically: choose the provider that issued your key.
No new SDK dependencies are needed; Gemini, Claude and compatible services use
server-side REST calls through Node's built-in `fetch`.

| Service | `AI_PROVIDER` | `AI_BASE_URL` | Example `AI_MODEL` |
| --- | --- | --- | --- |
| OpenAI | `openai` | unused | `gpt-4o-mini` |
| Google Gemini (AI Studio API key) | `gemini` | unused | `gemini-2.5-flash` |
| Anthropic Claude | `anthropic` | unused | `claude-sonnet-4-5` |
| Groq | `openai-compatible` | `https://api.groq.com/openai/v1` | Choose a current model with the selected JSON mode from Groq's documentation. |
| OpenRouter | `openai-compatible` | `https://openrouter.ai/api/v1` | Choose a current model/endpoint supporting structured outputs from OpenRouter's model catalogue. |

Example configuration for Gemini (set the key privately):

```dotenv
AI_PROVIDER=gemini
AI_API_KEY=
AI_MODEL=gemini-2.5-flash
```

Examples are not guarantees of current model availability or live integration.
OpenAI uses Responses API structured output, Gemini uses `generateContent` with
a JSON schema, and Claude uses Messages API `output_config.format`. These modes
require compatible models. Compatible services use `/chat/completions`; try
`AI_OUTPUT_MODE=json_object` only if your selected model supports JSON mode but
not native JSON schemas. The JSON-mode prompt includes the schema and **every
response is still validated with Zod**. Invalid, refused or truncated analyses
are rejected, not fabricated or saved. There is no automatic output-mode retry.

Only the selected provider receives reflections. There is no cross-provider
fallback; OpenRouter requests also disable its endpoint fallback. OpenRouter may
still route the initial request through a model provider according to its service
configuration. The form identifies the selected service, not any downstream
OpenRouter provider. A custom base URL must be a service you trust with both the
key and reflection text; redirects are rejected to avoid forwarding secrets.
Plain HTTP endpoints and cloud-specific authentication such as Vertex AI,
Bedrock and Azure deployments are not supported by these adapters.

Safe error messages distinguish missing configuration, authentication, quota,
rate limits, model access, request rejection, connection failure and timeout.
Server diagnostics contain only controlled provider/category values and HTTP
status, never keys, reflections or raw provider error messages. Billing/credits
and spending limits must be resolved with the provider; a ChatGPT subscription
does not include OpenAI API credits.

## Local persistence and security limitations

Reflections/analyses/feedback are stored in `.afterclass/store.json` and the
generated signing secret in `.afterclass/session-secret`. Writes are serialized
inside one server process and committed with atomic file rename. Reads and
writes filter by a server-verified session ID. Zod validates stored data; corrupt
data is reported as an error, never silently discarded. Files are created with
owner-only permissions where supported.

The HTTP-only signed cookie lasts 30 days, so the same browser retains its data
through refreshes and server restarts. Separate browsers get different sessions.
An anonymous signed cookie is a demo identity mechanism, **not production account
authentication**. Anyone with disk access can read the unencrypted store.
The reflection text is sent to the selected AI service. OpenAI Responses requests
use `store: false`; other providers have their own retention policies. This is
not a promise of zero provider retention. Avoid sensitive personal information.

Run **one server process** against each data directory. This file store is not
designed for clustered/multi-process use, high traffic or serverless hosts such
as Vercel. There is no retention/delete UI, rate limiting or account recovery.
To reset the demo, stop the server, delete `.afterclass`, clear the site's
cookies, and restart. Do not delete it if you want to keep student data.

## Demo journey (requires a configured key)

1. Open Daily Check-in and enter:

   > During our digital systems lab I enjoyed building logic circuits. It was
   > exciting to see how gates work, and I want to understand how a simple
   > processor is organized. I would like to try a small project.

2. Click **Find my insights**. The app requests real validated AI analysis, saves
   it, and navigates to My Discoveries. It does not save incomplete analyses.
3. Inspect tentative tags, early observations and possible directions. Expand
   **Why am I seeing this?** to see your actual reflection and date.
4. Open Your Next Steps. Inspect three example cards with a grounded reason,
   effort estimate and concrete next action. Real AI output determines exact
   interests; card ordering is not hardcoded.
5. Click **Not interested**: that item disappears, related-tag affinities decrease,
   and an eligible suggestion replaces it. Reload to check persistence.
6. Click **Save**: it moves to **Saved** on the same screen. Reload, then click
   **Mark completed**. It leaves Saved and remains excluded from fresh suggestions.
7. Add a reflection about a different topic, such as writing. Discoveries should
   not claim recurrence unless the same tag occurs in two reflections.
8. Open an incognito browser: it should not show the other browser's data.

## Matching and catalogue

`data/opportunities.json` contains **24 example suggestions**, including
competitions, campus-event exploration, projects, research, learning resources
and communities. Every entry is labelled **Example opportunity** and has
`url: null`: these are **not verified scheduled events** or open applications.
Campus next actions ask the student to check an official source.

The AI never creates catalogue entries. Internal matching:

- Per relevant interest: `6 + 2 × min(frequency − 1, 2)` for interest overlap.
- Exact normalized curiosity-tag overlap: `+2` once per opportunity.
- Feedback affinity per related tag: Saved `+2`, completed `+1`, dismissed `−2`.
- No prerequisites, or all tentative skill tags mentioned: `+1`. Possible
  skills remain unverified, not proof of qualification.
- Explicit available time: `+2` if effort fits, `−3` otherwise; no time inference
  from class durations. The recognizer is deliberately conservative.
- Deterministic tie-breaking by effort then catalogue ID. Scores are never
  shown to students. Saved/dismissed/completed items are excluded from fresh cards.
- No matching signal: clearly worded general exploration suggestions.
- Catalogue exhaustion: fewer than three cards and an honest message, never
  resurrected dismissals or invented opportunities.

Match reasons are deterministic and grounded in extracted tags and the actual
catalogue next action. An optional second AI explanation call was intentionally
omitted. AI extraction is tentative and prompt injection/grounding cannot be
guaranteed by prompting alone; there is no scientific ability assessment here.

## API and code map

| Endpoint | Behavior |
| --- | --- |
| `GET /api/session` | Verify/create signed cookie. |
| `GET /api/reflections` | Read this session's reflection text and dates. |
| `POST /api/reflections` | Validate 20–1,500 characters, extract AI signals, persist on success. |
| `GET /api/discoveries` | Aggregate up to the latest 50 reflections and evidence. |
| `GET /api/recommendations` | Return fresh and saved catalogue cards. |
| `POST /api/feedback` | Persist a known opportunity ID with saved/not_interested/completed status. |

POST requests require same-origin `Origin` and JSON. Personalized responses use
`Cache-Control: no-store`; ordinary responses do not reveal session IDs. Server
integrations import `server-only`; user/model text is rendered as text, not HTML.

Main files: `lib/ai.ts`, `lib/ai-providers.ts`, `lib/analysis.ts`, `lib/local-store.ts`,
`lib/session-signing.ts`, `lib/discoveries.ts`, `lib/recommendations.ts`,
`lib/schemas.ts`, `lib/catalogue.ts`, `app/api/*/route.ts`, and the three
`app/**/page.tsx` screens. Components contain the form, navigation, opportunity
card and shared loading/error/empty handling.

## Validation

Multi-provider update validation on this Windows workspace:

- Unit/API tests: **86 passed** (network mocked).
- Type checking and linting: **passed**.
- Browser tests: **10 desktop/mobile cases passed** after installing Chromium.
- Production build: **passed**.
- Live analysis: OpenAI remains blocked by account quota; other providers have
  not been live-tested because their credentials were not supplied.

```bash
npm run typecheck
npm run lint
npm run test
npx playwright install chromium
npm run test:e2e
npm run build
```

Unit/API tests cover catalogue validity, validation/sanitation, signed cookies,
grounded discoveries, matching, feedback, disk persistence/concurrent writes,
cross-session isolation, corrupt data and SDK errors. AI network calls are mocked
in these tests. Browser tests run on desktop and mobile against a separate
server on port 3100; successful AI journeys use **intercepted API fixtures**.
The missing-key browser case exercises the real local API with an empty key.
These tests **do not prove live provider integration**. Multi-provider unit tests
mock REST/SDK calls and cover request formats, configuration, output validation,
refusals/truncation, safe errors and no cross-provider credential reuse.

Original prototype validation results (historical; all commands exited **0**):

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run test` | PASS — 40 tests across 3 files |
| `npx playwright install chromium` | PASS |
| `npm run test:e2e` | PASS — 10 desktop/mobile cases |
| `npm run build` | PASS |
| `npm audit --omit=dev` | PASS — 0 production vulnerabilities |
| `npm start -- --port 3101` smoke check | PASS — three pages, local APIs, no-store headers and missing-key 503 |

Desktop/mobile browser screenshots were also inspected. Successful reflection
journeys in automated tests use mocked AI/network responses, not live AI.
The original live OpenAI smoke test was deferred. A subsequent local live check
reached OpenAI but returned HTTP 429 with a quota/billing error. Successful live
analysis remains unverified. Live Gemini/Claude/compatible-service checks have
not been run because credentials were not supplied. No deployment was attempted.

`npm audit` currently reports a high-severity `braces` denial-of-service advisory
through the development-only Next ESLint plugin (five dependent audit entries).
The registry's latest `braces` is still 3.0.3, within the affected range. No forced
framework downgrade or blanket suppression was applied. Production dependency
audit is checked separately; treat this as a tooling limitation until patched.

## Production-mode local run / future hosting

```bash
npm run build
npm start
```

This remains local-run-only. For future hosting use a single Node process on a
host with persistent disk, configure an absolute data directory and HTTPS, and
protect access. For serverless/multiple replicas, first replace the store with a
real database such as Supabase; the Supabase migration from the original
blueprint is intentionally not part of this local-first version.