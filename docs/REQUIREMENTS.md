# Roadmap traceability

Source: all 20 pages of `HarvestOS Master Development l Roadmap.pdf`, read as text and visually inspected. The source describes staged software and field work, not a promise that production integrations or research have already happened.

| PDF section / detail | Implementation or disposition |
| --- | --- |
| 1.1–1.4 Vision, Plateau tomato focus, staged releases, verified operating metrics | Public content, catalog seed, operational/impact reports; pilot targets remain proposals. Field release gates are in FIELD-PLAN.md. |
| 2.1 Palette | Exact forest, lime, emerald, ivory, charcoal, sage, amber/red tokens in `src/styles/_tokens.scss` and global styles. |
| 2.2 Typography, spacing, mobile, focus, labels | Bundled Manrope/Inter; 248px desktop sidebar, responsive cards/forms/tables; text status labels; focus rings, skip link, dialog keyboard trap; 320px browser test. |
| 2.3 Public and stakeholder navigation | Public pages and all eight workspaces. Transport invoices derive from accepted shipment charges; storage calendar is represented by actual availability/reservation intervals. |
| 3 Identities vs organizations, multi-membership, scoped roles | Supabase Auth/profiles and separate memberships; every write checks identity and resource scope. Cooperative delegation is explicit and expiring. |
| 3.1 Registration, verification, invitations, suspension, revocation, MFA | Register/recovery/reset/callback; verified email/phone required by server; evidence review, email-bound expiring invites, auditable membership suspension; admin MFA; controlled bootstrap. Supabase SMTP/account settings require operator configuration. |
| 4 Stack and session pooler | Next.js/TypeScript, Bun-only scripts and lockfile, Supabase SSR, postgres.js, PostGIS, Zod, SCSS/tokens/module styles, MapLibre, Vitest/Playwright. React local state avoids an unnecessary query dependency. |
| 4 Optional media/observability/hosting | Private Cloudinary workflow, optional Resend and Sentry envelope reporting; Vercel/Supabase deployment instructions. No hosting accounts or secrets invented. |
| 4.2–4.3 Three layers, migrations, outbox | `features/resources`, intelligence engine/persistence, commerce/fulfillment services; numbered migrations; transactionally queued notifications and separate retry worker. |
| 5.1 Public site | Home, process, farmer/buyer/logistics/storage, impact, about/contact, privacy/terms and auth; prototype disclosures; no invented achieved metrics. |
| 5.2 Farmer | Farms, dates, grade/variety, measured/local quantities, private photos, draft edits/publication, inventory lots/splitting, partial allocation, conditions/history, matching, offers/counters, orders, loss/outcome reporting and incidents. |
| 5.3 Buyer | Verified business organization, demand/window/expiry, destinations, marketplace, offers, receipts/grade/discrepancies, payment references and saved suppliers. Payment claims cannot self-confirm. |
| 5.4 Transport | Vehicle suitability, capacity and windows, quote board, assignments, status transitions, evidence, charges and failures. No live tracking per specification. |
| 5.5 Storage | Compatible crops, conditions, pricing and dates; provider confirmation; peak overlap capacity checks; intake/release quantities and shortfall/late-collection incidents. |
| 5.6 Coordinator/admin | Regional oversight and risk queue with factor/time/version explanations; matched demand; independent receipts, incidents, global super-admin access, audited configuration/catalog/policy versions. |
| 6 Harvest-to-sale | Complete service integration test creates farm/harvest/demand/offer, allocates, records receipt, verifies and reconciles remaining stock. Human logistics can be coordinator-assisted. |
| 6.2 Partial/reversal | 100kg example tested: 30kg + 40kg accepted, competing 40kg rejected; cancellation returns stock once; post-dispatch cancellation blocked. |
| 6.3 Exceptions and safe expiry | Pending-offer expiry; deadline/late-storage incidents; explicit payment state; retry guards; confirmed stock never silently released by background jobs. |
| 7.1 Risk | Exact 30/25/20/15/10 factor weights and 35/65/80 bands; configurable versions; refresh on ledger transitions, condition edits and worker cadence. Time normalization is an explicit prototype assumption: 50 at harvest, 100 after one handling window, lower before harvest. |
| 7.2 Matching | Crop, grade, standing, verification, dates, inventory, region and currency hard filters; 30/25/15/15/15 ranking over known inputs, visible coverage/missing data, partial quantities. Unknown reliability never fabricated. Current region compatibility is conservative, not a routing feasibility guarantee. |
| 7.3 Option comparison | Interactive local/distant/storage/joint-transport/processing comparison in Matches; documented revenue/costs, feasibility and risks; unknown costs keep net return unknown. |
| 7.4 AI boundaries | Deterministic calculations; no autonomous commitments, payment verification or unsupported spoilage predictions. |
| 8.1–8.3 All named entities | PostgreSQL migrations cover every listed table plus invitations/delegations, quotes, destinations, suppliers, media, policies, outcomes and rate limits; FKs/checks/indexes/UUIDs/timestamptz/minor-unit money; scoped PostGIS coordinates. |
| 9 API, concurrency, media | API.md enumerates contracts. Structured responses, bounded pagination/rate limits, Zod, same-origin mutation checks, row locks, uniqueness/idempotency, private validated media. Signature intent is routed through server byte validation. |
| 10 Structure and setup | App Router pages/API, shared components, feature services, auth/validation/database helpers, styles, versioned SQL, scripts, tests and documentation. Uses Bun instead of roadmap's npm examples, as requested. |
| 11 Security/privacy/reliability | Server authorization + read-only tenant RLS, admin MFA, immutable audit/history, bounded outbox retries, sanitized monitoring and release/restore runbook. Privacy/terms are drafts, not a compliance certification. Restore drills and provider/retention review need operator execution. |
| 12 QA and acceptance | Unit, authorization and PostgreSQL service tests; Playwright public/role/mobile tests; actual Supabase concurrency, PostGIS, email/MFA, cloud media and field checks retained as explicit acceptance gates. |
| 13 Delivery cadence/hackathon plan | FIELD-PLAN.md preserves 48-hour and ten-week ordering and demo flow. Software cannot perform interviews or establish pilot impact by itself. |
| 13.3 Postponed capabilities | Live payments, credit/insurance, native apps, IoT, fleet tracking, autonomous execution, advanced spoilage ML/global routing remain intentionally deferred. |
| 14 Deployment | Bun build/run, environment separation, CI, migration checksums, review/staging/smoke tests, backup/restore and rollback guidance. No production deployment performed. |
| 15 Field research/economics | Interview prompts, sample counts, pilot targets, verification methodology and proposed fee/subscription/cooperative/coordination/analytics hypotheses in FIELD-PLAN.md. No listing fees or payment charging implemented. |
| 16 International | Explicit ISO currencies, original units, locale/timezone and localized catalogs; monetary summaries grouped by currency. Translation catalogs/country legal validation and regional optimization belong to the later release. |
| 17 Risk register | Preserved with practical controls and field-validation limits in FIELD-PLAN.md. |
| 18 References/assumptions | Source text retained, official technical references in OPERATIONS.md; fictional fixtures isolated from actual records. |
| 19 Definition of done | Automated local service journey is verified. A real-user, connected, operational pilot remains gated on credentials, integration tests, field participants and evidence. |

No sample scenario is reported as rescued food. No live Supabase database was provisioned or migrated during this task because the user elected to supply credentials later.
