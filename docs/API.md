# API contracts

All operational endpoints require a verified Supabase identity. Organization/resource authorization is performed on the server. Admin/super-admin users must have AAL2. Requests from inactive users or suspended organizations fail closed. The browser must use the configured app origin for mutations. JSON bodies are capped at 64 KiB; private images use the separately capped upload endpoint.

Responses: `{ success: true, data, requestId }` or `{ success: false, error: { code, message, requestId } }`. Collection endpoints return `{ items, nextCursor }`, with 50 records per page. Use `?cursor=<UUID>` to continue. Directories/operational queues are bounded to 100 rows. Errors include 400 validation, 401 identity missing, 403 scope/MFA/origin, 404 missing resource, 409 conflict, 429 rate limit and 503 setup/integration unavailable. Server details and secrets are never returned.

| Method | Path | Contract |
| --- | --- | --- |
| GET | `/api/health` | Non-sensitive configuration readiness |
| GET | `/api/me`, `/api/catalogs` | Identity, approved scope and authorized form options |
| GET, POST | `/api/harvests` | Scoped list / validated draft |
| GET, PATCH | `/api/harvests/:id` | Authorized detail / optimistic versioned edit |
| POST | `/api/harvests/:id/publish` | Validate mass and dates; create first lot; assess risk |
| GET, POST | `/api/harvests/:id/risk` | Read latest / append reassessment |
| GET | `/api/harvests/:id/matches` | Eligible demand with factors, missing inputs and explanations |
| GET | `/api/marketplace` | Authenticated approximate-region discovery; no exact coordinates |
| GET, POST, PATCH | `/api/buyer-requirements[/:id]` | Verified buyer demand; cannot reduce below allocated mass |
| POST | `/api/offers` | Requires `Idempotency-Key`; quantity/price/deadline validation |
| POST | `/api/offers/:id/accept` | Atomic allocation and idempotent order creation |
| POST | `/api/offers/:id/reject`, `/counter` | Owner/delegated-agent decision; counter terms retained |
| GET | `/api/orders` | Orders involving authorized organizations |
| POST | `/api/orders/:id/cancel` | Reason required; pre-dispatch only |
| POST | `/api/orders/:id/confirm-receipt` | Buyer records received/rejected kg, grade and evidence |
| POST | `/api/orders/:id/verify-receipt` | Independent scoped staff review; documented costs optional |
| GET, POST | `/api/payments` | Unverified payment claims and evidence |
| POST | `/api/payments/:id/verify` | Independent admin verification |
| GET, POST, PATCH | `/api/farms[/:id]` | Scoped farm management |
| GET, POST, PATCH | `/api/transport/vehicles[/:id]` | Provider capacity and availability |
| GET | `/api/transport/requests` | Verified-provider quote board with limited order metadata |
| GET, POST | `/api/transport/quotes` | Order party requests; verified provider submits |
| POST | `/api/transport/quotes/:id/accept` | Order seller/coordinator books verified available vehicle |
| GET, POST | `/api/transport/shipments[/:id]` | Assigned provider job state and evidence |
| GET, POST, PATCH | `/api/storage/facilities[/:id]` | Compatible crops, capacity, conditions, price and calendar |
| GET, POST | `/api/storage/reservations` | Request capacity; no reservation until provider confirmation |
| POST | `/api/storage/reservations/:id/confirm` | Serialized overlapping-capacity check |
| POST | `/api/storage/reservations/:id/receive`, `/release`, `/reject` | Evidence-backed storage transitions |
| GET | `/api/directory/storage`, `/directory/transport` | Verified provider discovery |
| GET | `/api/operations/overview` | Region-scoped risk queue with assessment time and factors |
| GET | `/api/impact/summary` | Verified mass, losses, costs, orders, logistics and separate currencies |
| POST | `/api/lots/:id/loss`, `/split` | Available-stock-only loss or lot subdivision |
| POST | `/api/outcome` | Reconciled end-of-harvest declaration; differences open incidents |
| GET, POST | `/api/incidents` | Scoped evidence and operational exceptions |
| GET, POST | `/api/destinations`, `/saved-suppliers` | Buyer-side supporting records |
| POST | `/api/organizations/create`, `/invite`, `/accept-invite`, `/membership` | Identity lifecycle and scoped membership control |
| POST | `/api/organizations/intervention` | Reasoned intervention with audit history |
| GET, POST | `/api/delegations`, `/batches` | Expiring cooperative authorization and aggregation |
| POST | `/api/verification` | Supporting organization evidence |
| POST | `/api/account`, `/privacy-requests` | Profile editing and access/correction/deletion requests |
| GET | `/api/notifications` | Current user's in-app notifications |
| GET | `/api/admin/:section` | Scoped verification, users, organizations, audit, configuration, outbox; privacy is super-admin only |
| POST | `/api/admin/users/:id` | Super-admin status/role/region change; self-change and last-admin removal blocked |
| POST | `/api/admin/organizations/:id` | Scoped verification/suspension with reason |
| POST | `/api/admin/configuration/new` | Super-admin immutable model version; valid weights and thresholds |
| POST | `/api/admin/incidents/:id` | Assigned resolution with explanation |
| POST | `/api/admin/privacy/:id` | Super-admin request status; no automatic erasure of audit records |
| POST | `/api/catalog` | Super-admin crop/unit entry |
| GET, POST | `/api/policies` | Versioned operational settings; writes super-admin only |
| POST | `/api/media/signature` | Validates upload intent and returns server-upload contract; does not issue a bypass signature |
| POST | `/api/media/upload` | Actual image byte/size checks; server signing; private Cloudinary asset |
| GET | `/api/media/:id` | Reauthorizes and streams private evidence without exposing provider secrets |
| POST | `/api/jobs` | Constant-time bearer-secret check; bounded background maintenance |

Money is integer currency minor units, not floating naira. Quantity is up to three decimal places in PostgreSQL. Preserve reported local units; no default basket-to-kg conversion exists. All writes use parameterized postgres.js statements and allowlisted identifiers. `version` is required for harvest PATCH requests.

Counteroffer responses are new buyer offers with `parent_offer_id`; changing terms does not allocate stock. Receipt acceptance, independent verification and payment verification are distinct transitions. A rejected receipt quantity is returned to available inventory only after a documented review; loss is recorded separately.
