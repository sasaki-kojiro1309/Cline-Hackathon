# AfterClass — your long-term learning companion

For the problem statement, solution overview, architecture, judge walkthrough,
and how Cline was used, start with the [repository README](../README.md).
This document is the detailed setup and implementation reference.

AfterClass connects short reflections to tentative interests, evidence-backed
discoveries and catalogue-based next steps. **Every student must create an
account or log in using a Login ID and password. There is no anonymous/guest
option.** After login, the three main screens remain Daily Check-in, My
Discoveries and Your Next Steps; the login/create-account interface gates all
three screens without introducing another product page.

## Run locally (macOS/Linux and Windows)

Requires Node.js **24+** (SQLite is built into Node):

```bash
git clone https://github.com/sasaki-kojiro1309/Cline-Hackathon.git
cd Cline-Hackathon/afterclass
node --version
npm ci
# First setup only; keep an existing .env.local:
cp -n .env.example .env.local
# Edit .env.local with your AI provider, key, and model before continuing.
npm run check:config
npm run dev
```

Open **http://localhost:3000**. In `.env.local`, keep your working AI settings and
set `STORAGE_PROVIDER=local`. Set **`DATA_RETENTION_DAYS=0`** to keep history until
the student deletes it. This is the new default when the variable is absent, but
an existing explicit value such as 365 still applies until you change it.

If the repository is already checked out, start in its `afterclass` directory
instead of cloning again. On Windows PowerShell, replace the copy command with
`if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }`.
Use `npm.cmd ci` / `npm.cmd run dev` if PowerShell blocks npm's script wrapper.
No Supabase, email, SMTP or external database is required. Restart after
configuration changes. The config check tests presence only, not live AI access.

Without AI credentials, account creation and **Next Steps → Browse ideas** still
work. New reflections require successful AI analysis before they are saved;
missing keys produce an error, not simulated insights. Follow the
[judge walkthrough](../README.md#suggested-judge-walkthrough--about-five-minutes)
for the complete demo and the separate multi-day summary requirements.

### Development page keeps reloading

Browser tests run a separate server on port 3100 with a dedicated `.next-e2e`
build cache, so they do not overwrite the port 3000 server's `.next` HMR chunks.
Do not run two ordinary `npm run dev` processes against the same build cache.
If an existing server reports **HMR hash mismatch** and repeatedly reloads,
stop it, delete only `.next/dev`, and restart `npm run dev`. On Windows, use
`Remove-Item .next/dev -Recurse -Force` after stopping the server. This removes
generated development files, not the `.afterclass` database or `.env.local`.

### Gemini API errors

Set `AI_PROVIDER=gemini`, `AI_API_KEY` to a Gemini key from Google AI Studio,
and `AI_MODEL` to a model available to that key's project. Restart `npm run dev`
after changing `/Users/mac_m5/Documents/GitHub/Cline-Hackathon/afterclass/.env.local`.
`AI_OUTPUT_MODE` is only used by `openai-compatible`, not Gemini.

Run `npm run check:ai` from this app directory for a **read-only model metadata
check** using Next's development environment-file precedence. It does not send
reflections, generate output, consume generation tokens or modify stored data.
Success verifies metadata access and model generation capability, not generation
permission, billing/quota or structured-output compatibility.

**Metadata can still succeed for a retired/restricted model.** To check actual
generation, run `npm run check:ai -- --generate`. This explicitly uses a small
amount of API quota with synthetic text only; it never writes to the database.
In this project's live diagnostic, Google rejected `gemini-2.5-flash` for new
users and recommended `gemini-3.8-flash`. Verify availability with your own key;
model access can change independently of the app. The suggested model returned
503 during testing, while `gemini-3.1-flash-lite` successfully generated JSON;
the local configuration was switched to that working model.

- **403:** check Google project permissions, Generative Language API enablement
  and key restrictions. Browser HTTP-referrer restrictions do not work for this
  server-side integration. Allow `generativelanguage.googleapis.com`.
- **404:** the configured model is unavailable or unsupported on `v1beta`;
  changing keys alone will not fix an unavailable model name.
- **Blocked/leaked key:** revoke it and create a replacement in Google AI Studio.
- **429:** check project quota/billing; repeatedly creating keys in the same
  project does not reset project quota.

Never paste keys into chat or commit environment files. Provider errors are
converted to controlled messages; raw Google messages/project details are not
logged or returned to the browser.

## Accounts and student history

1. Open the app and click **Create account**.
2. Choose a unique Login ID (3–32 letters/numbers/underscores/hyphens; IDs are
   case-insensitive), optional display name, and password of **12–128 characters**.
3. Confirm the password. Successful registration logs you in.
4. Reflect and explore; records are assigned to your stable account ID on the
   server, never an owner ID supplied by the browser.
5. Open **Account & privacy → Sign out** before another student uses the browser.
6. Next visit, choose **Log in** with the same credentials. Your history and
   feedback return—even after cookies are cleared or the server restarts.

Passwords use Node's asynchronous **scrypt** with random salts; plaintext
passwords are never stored. Login sessions use 256-bit random tokens; only their
SHA-256 hashes are stored in SQLite. The browser gets an HTTP-only, SameSite=Lax
cookie, Secure in production. Sessions expire after 30 days. Logout revokes the
server session, so replaying the old cookie fails. Passwords/session tokens are
never included in account responses, exports or logs.

Login and registration are rate-limited by ID and by server. Invalid credentials
have a generic error; unknown IDs still perform password hashing work. Every
student-data API enforces login; old anonymous/cloud cookies grant no access.
The client gate hides reflection/discovery/privacy UI until login, and session
expiry returns the user to the login gate.

**No password reset/recovery or password-change UI is provided yet.** Remember
your Login ID/password. This is a local prototype, not a publicly audited identity
service. Credentials work only against the same running server/database—not a
different computer's separate database. Never expose the development server to
the public internet. HTTPS, abuse protection and a security review are required
before public hosting.

## SQLite and migration

SQLite automatically creates `.afterclass/afterclass.sqlite`. Schema version 2
adds `student_accounts` and `login_sessions` alongside reflections, feedback,
profiles, rate limits and metadata. Existing version-1 databases upgrade in place
without deleting rows. Bound SQL parameters, WAL journaling, busy timeout and
transactions protect normal local reads/writes; account creation/profile/session
creation and multi-table data deletion are transactional.

Old `store.json` still imports once if appropriate. **Historical anonymous
records are preserved on disk but are not automatically assigned to any new
account**, since that could attach someone else's history to a student. There is
no browser/API route to claim them. Back up the database before any operator-led
migration. Registration starts a distinct private account.

Backups: stop the server and copy the entire `.afterclass` folder, including any
`-wal`/`-shm` files. Restore only while stopped. Don't copy only the main SQLite
file while writes are active. Optional SQLite viewers can inspect tables; no
database installation is needed to run the app. Local files are unencrypted;
filesystem access grants access to data/hashes. Use appropriate OS permissions.

Default retention is **0 = until student deletion**. Positive values (1–3650)
enable on-access expiration of reflections/feedback. Profiles/accounts persist
until an operator removes them. Export includes all retained records. Delete
removes your AfterClass reflections, analyses, feedback and profile/display name,
but keeps the Login ID/password account so you can continue using it. It does not
remove provider copies, old JSON backups or external backup copies.

## AI and recommendations

Explicit AI consent is required on each submission. Avoid sensitive personal
information. Supported providers remain OpenAI, Gemini, Claude and trusted
OpenAI-compatible APIs. Configure `AI_PROVIDER`, `AI_API_KEY` and `AI_MODEL`;
compatible APIs also use `AI_BASE_URL` and `AI_OUTPUT_MODE`. Legacy OpenAI settings
are supported. No mock insights are substituted on outages/missing credentials.
The model/account must support the selected structured-output mode; availability
and credits are not guaranteed. AI processing remains an external dependency.

Discoveries and recommendations now read **all retained reflections**, rather
than the old latest-50 analysis/latest-200 read limits. History browsing is
paginated (20 entries per page); export still includes all retained data.

## Multi-day discovery engine

### Simplified navigation and exploration ideas

Discoveries has three keyboard-accessible internal tabs: **Overview**, **Patterns**
and **History**, with a shared compact date filter. Overview shows supported
interests and the latest daily clue; the optional combined summary is collapsed.
Patterns contains recurring themes, nonempty signal categories, mixed experiences
and expandable weekly detail. Duplicate skill/direction panels and empty sections
were removed. History retains search/pagination. Local data reloads after each
successful check-in, on returning to a visible browser tab, and across browser
tabs through a storage event. Successful check-ins do not fail when browser
storage is restricted.

Next Steps now uses **100 static activities labelled Exploration idea** spanning
school subjects, STEM, humanities, business, creative arts and practical skills.
Each is an idea to adapt—not a verified course, scheduled event or actual
competition. There are no live web searches, search APIs, grounding requests,
external-resource verification scripts or automatic paid update jobs.

**For you** re-ranks activities from all retained check-ins, recent curiosities and
saved/completed/not-interested feedback. It shows up to three supported matches,
without unrelated filler. **Browse ideas** provides subject filtering, text
search and pagination (12 activities per page), including subjects not currently
matched to reflections. Browsing is explicitly labelled as exploration, not a
claim about the student's interests. Feedback works in both views.

Student-facing wording emphasizes exploration: **Find ideas**, **Search
activities**, **Why try this?** and **Approximate time**. Cards describe what the
student can do rather than repeating prototype labels. A concise note clarifies
that ideas are not confirmed event/course listings. Internal example flags and
activity IDs remain unchanged to preserve data semantics and saved feedback.

The expanded catalogue includes geography, history, chemistry, biology, physics,
mathematics, astronomy, geology, economics, philosophy, literature, languages,
psychology, sociology, civics, law, finance, accounting, business, marketing,
agriculture, health, nutrition, sports, engineering, architecture, education,
photography, film, dance, music, environment and more. Subject synonyms such as
maths/mathematics and earth science/geology are normalized. AI reflection analysis
is still available through the selected provider; **removing real-time web data
does not remove AI reflection analysis**. Combined journey summaries remain
manual and consented. Local discoveries and recommendation rankings still update
after each successful check-in.

Retired web-result data is not used for cards or automatic requests. Existing
SQLite rows are preserved rather than silently deleted: a read-only legacy export
includes them, and Delete my data removes them. Existing activity IDs are retained
where possible, including four former resource IDs now associated with clearly
labelled example practice plans. Saved web-only IDs cannot appear in this example
catalogue; their stored feedback is still retained/exportable.

In **My Discoveries**, choose all time, the last 7 or 30 calendar days, or custom
inclusive dates. Calendar days and Monday–Sunday weeks use **UTC**, explicitly
labelled in the UI. All retained selected reflections contribute to counts.
Signals are deduplicated within a reflection and tracked by both reflection
count and distinct-day count; multiple entries on one day do not prove a
multi-day recurring interest. Top signals are shown (up to 12 per category),
with up to five supporting examples each. Older entries remain searchable.

The combined profile includes interests, enjoyed/difficult experiences,
curiosities and tentative skills. Exact normalized overlaps preserve mixed
experiences; this is not semantic contradiction detection. Calendar comparisons
use the latest 7 days ending at the range end and the preceding 7 days, using
only entries within the selected range. Both periods need entries; missing data
is not declining interest. Changes describe mentions, never measured ability.
Weekly overviews show the latest 12 active weeks; custom dates let you explore
older weeks. Optional reflection prompts are derived locally from existing
signals, not a paid AI request.

**Analyze my journey** is an explicit, separately consented AI action. It needs
reflections on at least two UTC days. It sends top aggregate signals computed
from all selected records and at most **30 representative excerpts**, capped at
320 characters each, plus bounded signal arrays. It does not send every raw
reflection, and is not exhaustive AI reading of long histories. The selected
AI provider returns a tentative overview, up to six patterns and three next
steps. Every item must cite actual IDs from the supplied excerpts; invented
citations, invalid JSON, refusals and truncated responses are rejected. Valid
IDs do not prove the model's interpretation is true—review supporting text.
Provider failure leaves daily reflections and deterministic discoveries intact.

Summaries are cached for **one hour in server memory**, with at most 100 cached
range/user combinations. Unchanged requests reuse the result; regeneration is
explicit. New data, period boundaries or configuration changes make it stale.
Removed/expired source records make it unavailable; deleting student data clears
the owner's cache. A final data fingerprint check prevents publishing a summary
if source data changed during generation. Caches are per server process and
not durable across restarts or shared across replicas; regeneration may cost API
credits after a restart. No database migration is required for this cache.
Journey generation is limited to three attempts per student/hour and shares
the deployment AI limit; cached reuse does not consume that generation limit.

Recommendations use distinct-day interest recurrence across retained history,
curiosities from the 30-day period ending on the latest reflection, available
time and existing feedback. They remain deterministic and catalogue-based.
The engine reads retained history into server memory for aggregation; extremely
large histories will eventually require database-side rollups. No silent row
cap is used to hide that limitation.
The catalogue contains **100 labelled examples**, all with null URLs. Effort
estimates describe illustrative exploration sessions, not verified commitments.
The general opportunity schema still validates non-example engineering fixtures,
but the app's Next Steps catalogue contains examples only.
ranking uses interests, conservative curiosities/synonyms, explicitly available
time, tentative prerequisite signals and save/dismiss/completion affinities.
Saved/completed/dismissed items stay out of fresh suggestions. Weak overlap is
honestly labelled exploratory. No ability or numerical career scores are shown.

## Environment

| Variable | Purpose |
| --- | --- |
| `STORAGE_PROVIDER=local` | Required for this local password-account version |
| `DATA_RETENTION_DAYS=0` | Keep history until deletion; positive values expire old records |
| `AFTERCLASS_DATA_DIR` | Optional absolute SQLite directory; defaults to `.afterclass` |
| `AI_PROVIDER` | openai, gemini, anthropic or openai-compatible |
| `AI_API_KEY`, `AI_MODEL` | Your server-only provider key/model |
| `AI_BASE_URL`, `AI_OUTPUT_MODE` | Compatible APIs only; trusted HTTPS URL / JSON mode |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Legacy OpenAI-only fallbacks |
| `APP_ORIGIN` | Optional exact local origin, required for a fixed hosted origin |
| `AI_HOURLY_LIMIT` | Deployment-wide AI attempts per hour, default 100; also 10 per student |

The previous Supabase adapter/migrations remain as engineering artifacts but
**are not an enabled account option** for this version. Selecting Supabase fails
closed instead of restoring anonymous/email-OTP access. `SESSION_SIGNING_SECRET`
is no longer required for password login; old signing files are preserved solely
for legacy compatibility. All environment secrets and data files are gitignored.

## API and testing

- `GET /api/account`: public login state; no student data when logged out.
- `POST /api/account`: register/login/logout; authenticated profile updates.
- `GET /api/session`: login-required session readiness (no guest cookie creation).
- Reflection, discovery, recommendation, feedback and privacy APIs all require a
  verified session. No client-supplied identity is accepted.
- `GET /api/health`: public catalogue/SQLite readiness, not proof of live AI access.
- `GET /api/discoveries?range=all|7|30|custom&start=YYYY-MM-DD&end=YYYY-MM-DD`: local combined discoveries; start/end required only for custom.
- `GET /api/reflections`: searchable retained history (`q`, `page`, optional `id` and date range); 20 rows per page with total count. Analysis/owner IDs are excluded.
- `GET /api/journey`: cached summary state for the same date-range parameters; never calls AI.
- `POST /api/journey`: `{selection: {range, start?, end?}, consent: true, refresh?: boolean}`; user-triggered combined summary.
- `GET /api/catalogue?subject=geography&q=map&page=1`: authenticated static example browsing with subject options, counts and 12 entries per page; never calls an external service.
- Personal responses use `Cache-Control: no-store`. POSTs require same-origin JSON.
- Safe logs show route/status/timing/request ID, never passwords/student text.

```bash
npm run typecheck
npm run lint
npm run test
npx playwright install chromium
npm run test:e2e
npm run build
npm run check:config
```

Tests cover password hashing, uniqueness, wrong credentials, session expiry and
revocation, restart persistence, student isolation, no-guest access, SQLite
migration/rollback/concurrency, privacy, ranking and multi-provider errors.
Successful AI journeys mock network responses; local account browser tests use
the real SQLite database with AI keys disabled. No paid AI calls or live cloud
checks were made during this update.

The multi-day tests additionally cover all-history
aggregation beyond 200 rows, UTC dates/weeks, same-day deduplication, mixed
experiences, search/pagination, citations, cache expiry/configuration/isolation,
retention/deletion, concurrent data changes and summary cost limits. Browser
tests cover date filters, weekly/profile rendering, explicit consent, evidence,
history search/pagination and AI failure without losing local discoveries.
New checks cover canonical-subject coverage, aliases, catalogue browsing,
save/completed/dismissed states, no external calls for catalogue/recommendations,
and export/deletion of retired web-search data.
Page-stability tests check that idle pages retain typed input and catalogue
filters without repeated document reloads or API reads. Playwright uses port 3100,
an isolated temporary SQLite directory, and a separate `.next-e2e` build cache.

`npm run test:live` explicitly requires `ALLOW_LIVE_SMOKE=true` and spends AI
credits. It creates an isolated test account, checks the journey and removes its
student data/logout afterwards; its Login ID remains in the staging database.
Do not run it without authorization. Hosting guidance: **DEPLOYMENT.md**.