# Local password-account prototype: operation and hosting

This version uses **SQLite accounts with Login ID/password only**. There is no
anonymous option, Supabase OTP flow or automatic anonymous-history claim. Do not
follow the previous Supabase email setup to activate this version.

## Local setup

Use Node 24+, `STORAGE_PROVIDER=local`, your AI configuration, and
`DATA_RETENTION_DAYS=0` for indefinite student history until deletion. Run
`npm install && npm run dev`; open localhost:3000 and create an account. Database
and account-table upgrades happen automatically. See README.md for macOS/Windows.

## Persistent host (future, not deployed here)

Use one Node server on a host with durable local disk, an absolute
`AFTERCLASS_DATA_DIR`, and a fixed HTTPS `APP_ORIGIN`. Run `npm run build` then
`npm start`. SQLite is not suitable for Vercel's ephemeral disk or distributed
replicas; Vercel is not supported by this local-account version. Provision a
database/account migration explicitly before choosing a serverless host.

Before public launch: security review, HTTPS, firewall/WAF/bot protection,
password recovery/account deletion policies, student age/consent policies,
backup/restore tests, provider spending limits and monitoring are required.
Scrypt and revocable cookies alone do not make a production-ready identity system.

## Backups and retention

Stop the server, copy the entire `.afterclass` directory including WAL files,
then restart. Test restore into another local/staging directory. Data and hashes
are not encrypted at rest. Deleting student data does not delete its Login ID or
password account, old JSON backups, provider copies or backups. Keep retention
policies consistent with your disclosure. `DATA_RETENTION_DAYS=0` disables automatic
reflection/feedback expiration; positive values enable on-access cleanup.

## Checks

Run typecheck, lint, unit/browser tests and build. `/api/health` checks SQLite and
catalogue readiness; it doesn't verify AI credits or account usability. Logs are
privacy-safe request metadata. All account/data operations are owner-scoped and
rate-limited; the server-wide login limiter can temporarily throttle a shared
demo server and is not a substitute for public-host abuse controls.

Paid live smoke test (optional, authorized staging only):

```bash
ALLOW_LIVE_SMOKE=true SMOKE_ORIGIN=http://localhost:3000 npm run test:live
```

This registers a test account and calls paid AI. It deletes that account's student
data and logs out afterward; the test account itself remains. Test logout/login,
restart persistence, two separate student accounts and backup restore separately.
No deployment or live AI success has been verified during this implementation.