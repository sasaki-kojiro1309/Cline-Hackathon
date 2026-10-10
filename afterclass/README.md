# AfterClass — your long-term learning companion

AfterClass connects short reflections to tentative interests, evidence-backed
discoveries and catalogue-based next steps. **Every student must create an
account or log in using a Login ID and password. There is no anonymous/guest
option.** After login, the three main screens remain Daily Check-in, My
Discoveries and Your Next Steps; the login/create-account interface gates all
three screens without introducing another product page.

## Run on macOS

Requires Node.js **24+** (SQLite is built into Node):

```bash
cd /Users/mac_m5/Documents/GitHub/Cline-Hackathon/afterclass
export PATH="/Users/mac_m5/.nvm/versions/node/v24.21.0/bin:$PATH"
npm install
# First setup only: cp .env.example .env.local
# Do not overwrite an existing .env.local.
npm run dev
```

Open **http://localhost:3000**. In `.env.local`, keep your working AI settings and
set `STORAGE_PROVIDER=local`. Set **`DATA_RETENTION_DAYS=0`** to keep history until
the student deletes it. This is the new default when the variable is absent, but
an existing explicit value such as 365 still applies until you change it.

Windows: use `npm.cmd install` / `npm.cmd run dev` in the app directory.
For first-time setup use `Copy-Item .env.example .env.local`. No Supabase, email,
SMTP or external database is required. Restart after configuration changes.

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

Discoveries aggregate the latest 50 reflections, count each tag once per
reflection, distinguish early observations from recurring mentions, and expose
the actual text/date behind observations. Equal-sized recent/prior reflection
windows show changing themes without implying ability growth or a career verdict.
Recent history reads up to 200 records; export includes all retained data.

The catalogue contains **24 labelled examples plus 4 official learning resources**
(MDN, CS50, Nand to Tetris, Purdue OWL) checked on 2026-10-10. These are not verified
scheduled campus events. Effort estimates describe small exploration sessions,
not completing whole courses. AI never creates catalogue listings. Deterministic
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
npm run check:resources
```

Tests cover password hashing, uniqueness, wrong credentials, session expiry and
revocation, restart persistence, student isolation, no-guest access, SQLite
migration/rollback/concurrency, privacy, ranking and multi-provider errors.
Successful AI journeys mock network responses; local account browser tests use
the real SQLite database with AI keys disabled. No paid AI calls or cloud
Final validation: typecheck **PASS**, lint **PASS**, **117 unit/API tests PASS**,
**8 desktop/mobile browser tests PASS**, and production build **PASS** (exit 0).

`npm run test:live` explicitly requires `ALLOW_LIVE_SMOKE=true` and spends AI
credits. It creates an isolated test account, checks the journey and removes its
student data/logout afterwards; its Login ID remains in the staging database.
Do not run it without authorization. Hosting guidance: **DEPLOYMENT.md**.