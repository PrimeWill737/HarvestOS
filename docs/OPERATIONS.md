# Operations and deployment

## Environment and release

Use distinct Supabase projects and credentials for development, staging and production. Keep `.env` private; use the host secret store in deployments. Set the real app URL, Supabase Auth Site URL/redirect allowlist, verified SMTP sender and TOTP MFA. Database and provider secrets must never use a NEXT_PUBLIC_ prefix.

The direct SQL account does not inherit a browser JWT. Server authorization is mandatory; browser RLS is a separate defense. Provision a restricted application database account and a separately controlled migration account before production. Review table/function grants after migration.

Release sequence: review PR and migrations; run Bun install/typecheck/tests/build; verify backup; migrate staging; seed catalogs; run connected acceptance; deploy staging; run browser journeys; migrate production using a forward-compatible reviewed plan; release; run production smoke checks. Never modify an applied migration: checksums detect changes. Use a new migration.

Next.js can be deployed to Vercel or a Node host with `bun install --frozen-lockfile`, `bun run build`, and `bun run start`. No deployment was performed during the local build. Two database connections per instance are a conservative starting point; benchmark actual session-pooler concurrency and latency.

## Background jobs

Schedule `bun run worker` or `POST /api/jobs` with `Authorization: Bearer <CRON_SECRET>`. Generate a separate secret per environment; never put it in a URL. Outbox rows use FOR UPDATE SKIP LOCKED, deterministic in-app notification IDs, provider idempotency keys, bounded retries and dead-letter status. Stale processing jobs are reclaimed after ten minutes.

The worker expires pending offers, opens late-pickup and late-storage incidents, marks aged incidents for escalation, refreshes risk and cleans rate counters. It never silently releases confirmed stock. Operational policies version pickup grace, escalation timing and retention expectations. Retention is a policy record; automatic deletion of financial/audit evidence is intentionally not enabled.

## Backup and restore

Before schema-breaking changes, verify provider backup/PITR coverage and take an encrypted logical backup using supported PostgreSQL tooling. Record backup time, deployed version and migration checksums. Restrict backup access independently of app users. Do not copy database passwords into tickets, command logs or documentation.

Rehearse a restore into a separate staging project using Supabase's supported process, including Auth identity/application references. Verify row counts, foreign keys, grants/RLS, immutable-history triggers and stock reconciliation. Run authenticated acceptance tests and record actual recovery time/data-loss window. This local task did not execute a real restore drill.

Rollback the app to a compatible previous build when possible. Prefer a reviewed forward-fix migration. Do not blindly drop columns or rewrite inventory/audit history. For corruption, stop writes, preserve evidence, restore in isolation and reconcile before switching traffic.

## Monitoring and incidents

Monitor host API latency/failures, Supabase connections/pool utilization, oldest pending outbox age, dead letters, failed pickups, open/escalated incidents and inventory discrepancies. API errors carry request IDs; optional Sentry events omit request payloads, coordinates and credentials. Define thresholds from actual pilot traffic.

For an access incident, suspend affected access through audited controls, rotate relevant credentials, preserve logs/evidence, assign an owner, document containment and resolution, and complete the operator's applicable notification review. Draft privacy text is not a compliance certification.

## Provider acceptance

- Supabase: real email verification, recovery, cookie refresh, TOTP, revoked/suspended access and direct client RLS.
- PostgreSQL/PostGIS: extension schema, actual coordinate queries, SSL, migration checksums and independent concurrent clients.
- Cloudinary: actual image format/byte-size rejection, private storage, authorized retrieval and cross-tenant denial. Clean orphan uploads if provider upload succeeds but the following database write fails.
- Resend: verified sender, failures/retries and idempotency. SMS is not configured.
- MapLibre: operator-supplied licensed style, attribution and allowed tile/sprite/font origins. No default tiles are fetched; exact farm coordinates remain scoped.
- Sentry: sanitized event delivery, project access, retention and data-transfer review.

## Official technical references

- [Next.js authentication](https://nextjs.org/docs/app/guides/authentication)
- [Next.js cookies](https://nextjs.org/docs/app/api-reference/functions/cookies)
- [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Supabase PostgreSQL connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Cloudinary private media](https://cloudinary.com/documentation/control_access_to_media)
- [Cloudinary Upload API](https://cloudinary.com/documentation/image_upload_api_reference)
- [MapLibre](https://maplibre.org/maplibre-gl-js/docs/)

The installed Next.js package's route-handler and authentication guides were also checked.
