# HarvestOS

A local implementation of the 20-page HarvestOS master roadmap: Next.js App Router, TypeScript, Bun, Supabase Auth, PostgreSQL/PostGIS, SCSS, and separate record, intelligence and execution services.

## Start the local preview

```sh
bun install
bun run dev
```

Open http://localhost:3000. Explore the coordinator workspace at `/workspace/operations` and the super administrator panel at `/workspace/super-admin`.

Without connection credentials, workspaces contain **fictional, read-only design fixtures**. Preview writes are disabled. The API does not substitute demo data for a database. No real sales, payments or avoided-loss claims are seeded.

## Connect your Supabase project

`.env` has already been created and ignored by Git. `.env.example` lists every setting. Add your own service credentials here. An older `.env.local` is preserved as an ignored `.env.local.disabled` backup and is not loaded.

1. Create separate Supabase projects for development, staging and production. Copy the actual **Session Pooler** URL from the project Connect screen into `DATABASE_URL`. Usually this uses port 5432; verify the actual connection, and URL-encode special password characters. Do not use an invented pooler hostname.
2. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_APP_URL`. Never put a database password or privileged key in a `NEXT_PUBLIC_` variable.
3. Configure Supabase Auth's Site URL and redirect allowlist to include `http://localhost:3000/auth/callback` and the corresponding deployed callback. Enable email confirmation and TOTP MFA. Configure a deliverable SMTP sender for real verification/recovery emails.
4. Apply the migrations and catalog seed with a database migration account:

   ```sh
   bun run env:check
   bun run db:migrate
   bun run db:seed
   ```

5. Restart the app. Register and verify the first administrator's email. Set `BOOTSTRAP_ADMIN_EMAIL` to that address and run:

   ```sh
   bun run admin:bootstrap
   ```

6. Open `/auth/mfa`, enroll an authenticator, and verify its code. Then open `/workspace/super-admin`. The bootstrap script refuses to run once a super administrator exists. Subsequent grants go through the audited panel; MFA is enforced server-side on every privileged request, including in development.
7. Create organizations through Account. Use the administrator's verification panel to approve buyer, cooperative, transport and storage organizations with supporting evidence. Invite members using expiring, email-bound tokens. Membership is never inferred from a role label.

The SQL targets **Supabase PostgreSQL**, including its existing `auth.users`, `auth.uid()`, `anon` and `authenticated` roles. It is not a standalone replacement for Supabase Auth. PostGIS installs in `extensions`. Use `DATABASE_SSL=require` for hosted connections. The two-connection pool is a starting point to load-test, not a universal capacity recommendation.

## Included workspaces

| Workspace | Main capabilities |
| --- | --- |
| Farmer | Farms, draft/public harvests, local units and measured mass, offers/counters, partial allocations, orders, storage, shipment requests, loss/outcome reporting, private photos |
| Buyer | Verified requirements, marketplace, offers, receipt/grade/discrepancy reporting, payment references, destinations, saved suppliers |
| Transport | Vehicles, suitability and availability, quote board, confirmed assignments, job state transitions, delivery evidence and charges |
| Storage | Facilities, crop compatibility, dated capacity, provider-confirmed reservations, actual intake/release and discrepancy incidents |
| Cooperative | Explicit expiring farm delegations and aggregation batches; bounded harvest access |
| Coordinator | Regional risk queue, explanations, matches, cost comparison, logistics/storage coordination, interventions, receipt review and impact |
| Admin | Regional verification, user visibility, organization oversight, incidents, audit, configurations and outbox inspection |
| Super admin | Global audited access management, suspensions, region assignments, organization verification, versioned scoring/policies, catalogs, privacy requests and audit |

The public site includes home, process, all stakeholder entry points, impact methodology, about, contact, privacy and terms. Privacy/terms are operational drafts requiring the actual operator's identity and legal review before a live pilot.

## Transaction guarantees

- Offer acceptance locks the offer, lot, harvest and demand and conditionally updates remaining stock inside one transaction. An offer creates at most one order. Offer submission uses caller-bound idempotency keys; accepted-offer retries return the same order.
- Available, reserved, sold and lost mass are distinct. Database checks prevent negative or overallocated inventory. Cancellation before dispatch returns stock once. Later reversals require an incident and controlled review.
- Buyer receipt is a claim. A different authorized reviewer verifies it before inventory becomes verified sold mass. Rejected mass returns to available stock only after documented resolution; physical deterioration requires a separate loss record.
- Payment references remain unverified until an administrator reviews independent evidence. A claimant cannot verify their own payment record. This release does not charge or transfer money.
- Storage confirmation serializes on the facility and checks peak simultaneous occupancy. Vehicle assignment serializes on the vehicle and checks overlapping bookings.
- Sensitive changes append audit history. Audit, inventory movement and risk records reject updates/deletes. Browser database access is read-only and tenant-scoped; operational writes use authenticated server services.
- Risk is a versioned prototype coordination score, not a spoilage probability. Matching excludes hard conflicts before ranking; unknown costs/reliability remain unknown. Impact does not infer avoided loss from a match or sale.

## Optional services

| Configuration | Behavior |
| --- | --- |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Server-validated private JPEG/PNG/WebP uploads, up to 5 MB; authorized evidence proxy. Optional until configured. |
| `RESEND_API_KEY`, `NOTIFICATION_FROM` | Outbox email delivery. In-app notifications work without Resend. No SMS provider is assumed. |
| `SENTRY_DSN` | Sanitized server error events with request IDs; no payloads, passwords or farm coordinates sent. |
| `NEXT_PUBLIC_MAP_STYLE_URL`, `MAP_ALLOWED_ORIGINS` | MapLibre maps for authorized farm coordinates. Supply licensed tile/style/font/sprite origins, comma-separated, and retain provider attribution. No default third-party map requests. |
| `CRON_SECRET` | Bearer credential for `POST /api/jobs`. Use a separate generated secret per deployed environment. |

Run `bun run worker` on a scheduler, or schedule authenticated `POST /api/jobs`. The worker sends queued notifications with retry bounds, flags missed pickups and late storage collection, marks old incidents for escalation, expires pending offers, refreshes risk scores and cleans old rate-limit counters. It **does not silently release confirmed inventory**. Schedule at an interval appropriate to the pilot and monitor queue age.

## Verify

```sh
bun run typecheck
bun run test
bun run test:e2e
bun run build
bun run start
```

Vitest includes scoring, authorization and PostgreSQL service integration tests. The embedded PGlite suite substitutes only the PostGIS coordinate type/index and supplies a test Auth schema; it exercises real transactions, constraints, RLS and the application commerce services, including a full farm-to-verified-sale journey. PGlite serializes connections, so also run the real multi-connection Supabase acceptance checklist before production. It does not prove hosted pooler performance or PostGIS behavior.

Playwright checks public pages, all workspaces, read-only preview, fail-closed APIs and 320px layouts. On Windows it uses installed Chrome by default. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` for another executable; on other systems install Chromium with `bunx playwright install chromium`. Authenticated Supabase email/MFA, provider delivery and field acceptance require your credentials and real test participants.

See [requirements coverage](docs/REQUIREMENTS.md), [API contracts](docs/API.md), [operations and deployment](docs/OPERATIONS.md), [field validation plan](docs/FIELD-PLAN.md), and [acceptance checklist](docs/ACCEPTANCE.md). The original PDF is retained unchanged; its full extracted text is in `docs/specification.txt`.

## Explicitly deferred by the roadmap

Live payments, lending, insurance, native mobile apps, IoT, live fleet tracking, autonomous commitments, advanced spoilage ML and globally optimized routing are not enabled. Regional expansion, multilingual translations and financial integrations require field evidence and subsequent implementation. No production deployment has been made.
