# Acceptance checklist

## Verified locally

The automated suite covers risk/matching rules and unknown inputs; role/organization/region denial; PostgreSQL schema checks and RLS; immutable history; idempotent acceptance; competing quantities; one-time cancellation release; receipt vs verified impact; storage overlap; excessive loss rejection; and a full application-service farm-to-verified-sale journey.

PGlite runs real PostgreSQL semantics but serializes clients. Its test harness supplies an Auth schema and substitutes the unavailable PostGIS coordinate type/index. It is not evidence of live pooler performance or geospatial behavior.

Playwright covers public pages, all eight workspaces, read-only preview forms, setup failure for privileged APIs, and 320px registration/navigation. Screenshots are in `docs/screenshots`.

## Connected staging gates (credentials required)

1. Register/verify each stakeholder; test email recovery, cookies, TOTP, expired sessions, suspension and AAL1 admin denial.
2. Verify organizations and email-bound invites. Test expiration, wrong recipient, suspension and cooperative delegation expiry.
3. Complete the actual UI journey: farm → harvest → publish → demand → offer → acceptance → quote → dispatch → collection → transit → delivery → receipt → independent verification.
4. Use independent database connections for competing lot, storage and vehicle bookings. Check rollbacks, retries, no overbooking and one order per accepted offer.
5. Test counters, expiry, partial quantities, pre/post-dispatch cancellation, rejected receipts, physical deterioration, no-shows and missing costs.
6. Record an unverified payment and prove the claimant cannot independently verify it. Review trusted evidence with a different administrator.
7. Test malformed/oversized/fake-MIME images, private provider storage and cross-tenant evidence denial.
8. Verify PostGIS and authorized maps. No exact coordinates in public or marketplace records. Check tile licensing/attribution.
9. Run competing workers and notification failures; check bounded retries/dead letters and deadline incidents without silent stock release.
10. Restore to an isolated project and check Auth references, grants, immutable history and stock balance. Record recovery objectives.
11. Test low-bandwidth Android devices, keyboard/screen reader, 200% zoom, contrast and actual tasks with each stakeholder.
12. Complete operator contact/privacy/terms, lawful processing, retention/provider/cross-border review before production data collection.

## Status

The local app and automated checks are delivered. Supabase/PostGIS production behavior, cloud integrations, deployment, restore drills, legal review, interviews, calibrated assumptions and verified pilot impact remain external acceptance work. No real project was provisioned or migrated because the user will add credentials later.
