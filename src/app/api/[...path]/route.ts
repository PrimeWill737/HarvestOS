import { NextRequest, NextResponse } from 'next/server';
import { reportError } from '@/lib/observability';
import { z, ZodError } from 'zod';
import { createHash } from 'node:crypto';
import { actor, authorize, requireRole, scope } from '@/lib/auth';
import { db, configured } from '@/lib/db';
import { Problem, assert } from '@/lib/errors';
import { schemas } from '@/lib/validation';
import {
  listResource,
  createResource,
  harvestAccess,
  publishHarvest,
  evaluateRisk,
  harvestMatches,
  marketplace,
  impact,
} from '@/features/resources';
import {
  placeOffer,
  acceptOffer,
  cancelOrder,
  confirmReceipt,
  verifyReceipt,
  recordLoss,
  orderAccess,
} from '@/features/commerce';
import { storageAction, acceptQuote, shipmentAction } from '@/features/fulfillment';
import { adminOverview, adminChange } from '@/features/admin';
import { organizationAction } from '@/features/organizations';
import { audit } from '@/features/audit';
import { updateResource } from '@/features/updates';
import { extendedRead, extendedWrite } from '@/features/extended';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const aliases: Record<string, string> = {
  'buyer-requirements': 'requirements',
  'transport/vehicles': 'vehicles',
  'transport/quotes': 'quotes',
  'transport/shipments': 'shipments',
  'storage/facilities': 'facilities',
  'storage/reservations': 'reservations',
  'saved-suppliers': 'saved_suppliers',
};
async function handler(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const requestId = crypto.randomUUID();
  try {
    const segments = (await context.params).path,
      path = segments.join('/'),
      method = req.method;
    if (path === 'health')
      return NextResponse.json({
        success: true,
        data: { status: configured() ? 'configured' : 'setup_required' },
        requestId,
      });
    const a = await actor();
    const sql = db();
    if (method !== 'GET') {
      const origin = req.headers.get('origin');
      assert(
        origin === new URL(process.env.NEXT_PUBLIC_APP_URL || req.url).origin,
        'INVALID_ORIGIN',
        'Mutation requests must originate from this application.',
        403,
      );
      assert(
        Number(req.headers.get('content-length') || 0) <= 65536,
        'BODY_TOO_LARGE',
        'Request too large.',
        413,
      );
    }
    const [rate] = await sql`
insert into
  api_rate_limits (key, window_start, hits)
values
  (${a.id + ':' + segments.slice(0, 2).join('/')}, date_trunc('minute', now()), 1)
on conflict (key) do update
set
  hits = case
    when api_rate_limits.window_start = date_trunc('minute', now()) then api_rate_limits.hits + 1
    else 1
  end,
  window_start = date_trunc('minute', now())
returning
  hits
`;
    assert(
      rate.hits <= Number(process.env.RATE_LIMIT_PER_MINUTE || 60),
      'RATE_LIMITED',
      'Too many requests. Retry in one minute.',
      429,
    );
    let data: unknown;
    const ids = await scope(a);
    if (method === 'GET') {
      if (['delegations', 'batches', 'transport/requests', 'policies'].includes(path))
        data = await extendedRead(a, path);
      else if (path === 'me')
        data = {
          ...a,
          organizations: await sql`
select
  o.*,
  m.role as membership_role
from
  organizations o
  left join organization_memberships m on m.organization_id = o.id
  and m.user_id = ${a.id}
where
  o.id = any (${ids}::uuid[])
`,
          configured: true,
        };
      else if (path === 'memberships')
        data = {
          members: await sql`
select
  m.*,
  p.full_name
from
  organization_memberships m
  join profiles p on p.id = m.user_id
where
  m.organization_id = any (${ids}::uuid[])
`,
          invitations: await sql`
select
  id,
  organization_id,
  email,
  role,
  status,
  expires_at
from
  invitations
where
  organization_id = any (${ids}::uuid[])
`,
        };
      else if (path === 'catalogs')
        data = {
          crops: await sql`select * from crops order by name`,
          units: await sql`select * from units`,
          farms:
            await sql`select id,name,organization_id from farms where organization_id=any(${ids}::uuid[])`,
          lots: await sql`
select
  l.*,
  h.organization_id,
  c.name as crop
from
  harvest_lots l
  join harvests h on h.id = l.harvest_id
  join crops c on c.id = h.crop_id
where
  h.organization_id = any (${ids}::uuid[])
`,
        };
      else if (path === 'marketplace') data = await marketplace();
      else if (path === 'directory/storage')
        data = await sql`
select
  f.*,
  o.name as provider
from
  storage_facilities f
  join organizations o on o.id = f.organization_id
where
  o.verification_status = 'verified'
  and f.available_until > now()
limit
  100
`;
      else if (path === 'directory/transport')
        data = await sql`
select
  v.*,
  o.name as provider
from
  transport_vehicles v
  join organizations o on o.id = v.organization_id
where
  o.verification_status = 'verified'
  and v.available_until > now()
limit
  100
`;
      else if (path === 'impact/summary' || path === 'reports') data = await impact(a);
      else if (path === 'operations/overview') {
        requireRole(a, ['coordinator', 'admin', 'super_admin']);
        data = await sql`
select
  h.id,
  h.organization_id,
  c.name as crop,
  h.grade,
  h.estimated_harvest_date,
  r.score,
  r.level,
  r.factors,
  r.model_version,
  r.created_at as last_evaluated_at
from
  harvests h
  join crops c on c.id = h.crop_id
  left join lateral (
    select
      *
    from
      risk_assessments
    where
      harvest_id = h.id
    order by
      created_at desc
    limit
      1
  ) r on true
where
  h.organization_id = any (${ids}::uuid[])
  and h.status in ('published', 'partially_allocated', 'allocated')
order by
  r.score desc nulls last
limit
  100
`;
      } else if (segments[0] === 'admin') data = await adminOverview(a, segments[1]);
      else if (path === 'notifications')
        data =
          await sql`select * from notifications where user_id=${a.id} order by created_at desc limit 100`;
      else if (path === 'payments')
        data = await sql`
select
  p.*
from
  payment_records p
  join orders o on o.id = p.order_id
where
  o.seller_organization_id = any (${ids}::uuid[])
  or o.buyer_organization_id = any (${ids}::uuid[])
order by
  p.created_at desc
limit
  100
`;
      else if (segments[0] === 'harvests' && segments[1]) {
        z.uuid().parse(segments[1]);
        await harvestAccess(a, segments[1]);
        if (segments[2] === 'risk')
          data =
            (
              await sql`select * from risk_assessments where harvest_id=${segments[1]} order by created_at desc limit 1`
            )[0] ?? null;
        else if (segments[2] === 'matches') data = await harvestMatches(a, segments[1]);
        else
          data = {
            ...(await harvestAccess(a, segments[1])),
            lots: await sql`select * from harvest_lots where harvest_id=${segments[1]}`,
          };
      } else {
        const cursor = req.nextUrl.searchParams.get('cursor') || undefined;
        if (cursor) z.uuid().parse(cursor);
        data = await listResource(a, aliases[path] || path, cursor);
      }
    } else {
      const raw = await req.text();
      assert(raw.length <= 65536, 'BODY_TOO_LARGE', 'Request too large.', 413);
      let body: any;
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Problem(400, 'INVALID_JSON', 'Provide valid JSON.');
      }
      if (
        method === 'PATCH' &&
        ['requirements', 'buyer-requirements', 'farms'].includes(segments[0]) &&
        segments[1]
      )
        data = await updateResource(
          a,
          segments[0] === 'buyer-requirements' ? 'requirements' : segments[0],
          z.uuid().parse(segments[1]),
          body,
        );
      else if (
        method === 'PATCH' &&
        ['transport', 'storage'].includes(segments[0]) &&
        ['vehicles', 'facilities'].includes(segments[1]) &&
        segments[2]
      )
        data = await updateResource(a, segments[1], z.uuid().parse(segments[2]), body);
      else if (['delegations', 'batches', 'outcome', 'catalog', 'policies'].includes(path))
        data = await extendedWrite(a, path, body);
      else if (segments[0] === 'lots' && segments[2] === 'split')
        data = await extendedWrite(a, 'split-lot', body, z.uuid().parse(segments[1]));
      else if (segments[0] === 'admin')
        data = await adminChange(a, segments[1], segments[2] || '', body);
      else if (segments[0] === 'organizations')
        data = await organizationAction(a, segments[1] || 'create', body);
      else if (path === 'offers')
        data = await placeOffer(a, body, req.headers.get('idempotency-key') || '');
      else if (segments[0] === 'offers' && segments[2] === 'accept')
        data = await acceptOffer(a, z.uuid().parse(segments[1]));
      else if (segments[0] === 'offers' && ['reject', 'counter'].includes(segments[2])) {
        data = await sql.begin(async (tx) => {
          const [o] = await tx`
select
  p.*,
  h.organization_id as seller
from
  purchase_offers p
  join harvest_lots l on l.id = p.lot_id
  join harvests h on h.id = l.harvest_id
where
  p.id = ${z.uuid().parse(segments[1])}
for update of
  p
`;
          assert(o, 'NOT_FOUND', 'Offer not found.', 404);
          await authorize(a, o.seller, ['owner', 'manager', 'agent'], tx);
          assert(o.status === 'pending', 'INVALID_TRANSITION', 'Offer is no longer pending.');
          if (segments[2] === 'counter') {
            const v = z
              .object({
                price_minor: z.number().int().positive(),
                quantity_kg: z.number().positive(),
                expires_at: z.iso.datetime({ offset: true }),
              })
              .strict()
              .parse(body);
            assert(
              v.quantity_kg <= Number(o.quantity_kg),
              'INVALID_QUANTITY',
              'Counter cannot increase requested mass.',
            );
            assert(
              new Date(v.expires_at) > new Date(),
              'INVALID_EXPIRY',
              'Counter deadline must be in the future.',
            );
            await tx`update purchase_offers set counter_terms=${tx.json(v)} where id=${o.id}`;
            await audit(tx, a, 'counter-proposal', 'purchase_offers', o.id, o.seller, o, v);
          }
          const [out] =
            await tx`update purchase_offers set status=${segments[2] === 'reject' ? 'rejected' : 'countered'} where id=${o.id} returning *`;
          await audit(tx, a, segments[2], 'purchase_offers', o.id, o.seller, o, {
            ...out,
            counterTerms: body,
          });
          return out;
        });
      } else if (segments[0] === 'harvests' && segments[2] === 'publish') {
        data = await publishHarvest(a, z.uuid().parse(segments[1]));
        await evaluateRisk(a, segments[1]);
      } else if (segments[0] === 'harvests' && segments[2] === 'risk')
        data = await evaluateRisk(a, z.uuid().parse(segments[1]));
      else if (segments[0] === 'harvests' && method === 'PATCH') {
        const id = z.uuid().parse(segments[1]);
        data = await sql.begin(async (tx) => {
          const [h] = await tx`select * from harvests where id=${id} for update`;
          assert(h, 'NOT_FOUND', 'Harvest not found.', 404);
          await authorize(a, h.organization_id, ['owner', 'manager', 'agent'], tx);
          const v = z
            .object({
              version: z.number().int(),
              grade: z.string().min(1).optional(),
              variety: z.string().min(1).optional(),
              estimated_harvest_date: z.iso.date().optional(),
              available_until: z.iso.datetime({ offset: true }).optional(),
              total_quantity: z.number().positive().optional(),
              measured_kg: z.number().positive().optional(),
              price_minor: z.number().int().positive().optional(),
              storage_adequacy: z.number().min(0).max(100).optional(),
              delay_hours: z.number().min(0).optional(),
              condition_risk: z.number().min(0).max(100).optional(),
            })
            .strict()
            .parse(body);
          assert(
            v.version === h.version,
            'VERSION_CONFLICT',
            'Harvest changed. Refresh before editing.',
          );
          const { version, ...changes } = v;
          if (h.status !== 'draft')
            assert(
              ![
                'grade',
                'variety',
                'estimated_harvest_date',
                'available_until',
                'total_quantity',
                'measured_kg',
              ].some((k) => k in changes),
              'PUBLISHED_FIELDS_LOCKED',
              'Published crop and quantity terms are immutable. Use a new harvest or a controlled inventory event.',
            );
          assert(
            new Date((changes as any).available_until || h.available_until) >
              new Date((changes as any).estimated_harvest_date || h.estimated_harvest_date),
            'INVALID_DATES',
            'Collection deadline must follow harvest date.',
          );
          assert(Object.keys(changes).length > 0, 'NO_CHANGES', 'Provide changes.', 400);
          const [out] =
            await tx`update harvests set ${tx(changes)},version=version+1,updated_at=now() where id=${id} returning *`;
          await audit(tx, a, 'update', 'harvests', id, h.organization_id, h, out);
          return out;
        });
        if ((data as any).status !== 'draft') await evaluateRisk(a, id);
      } else if (segments[0] === 'lots' && segments[2] === 'loss')
        data = await recordLoss(a, z.uuid().parse(segments[1]), body);
      else if (segments[0] === 'orders' && segments[2] === 'cancel')
        data = await cancelOrder(
          a,
          z.uuid().parse(segments[1]),
          z.string().min(8).parse(body.reason),
        );
      else if (segments[0] === 'orders' && segments[2] === 'confirm-receipt')
        data = await confirmReceipt(a, z.uuid().parse(segments[1]), body);
      else if (segments[0] === 'orders' && segments[2] === 'verify-receipt')
        data = await verifyReceipt(
          a,
          z.uuid().parse(segments[1]),
          z
            .object({
              transport_minor: z.number().int().nonnegative().optional(),
              storage_minor: z.number().int().nonnegative().optional(),
              fees_minor: z.number().int().nonnegative().optional(),
              resolution: z.string().optional(),
            })
            .strict()
            .parse(body),
        );
      else if (path === 'payments') {
        const v = schemas.payments.parse(body);
        data = await sql.begin(async (tx) => {
          const o = await orderAccess(a, v.order_id, tx);
          assert(
            o.currency === v.currency,
            'CURRENCY_MISMATCH',
            'Payment currency must match the order.',
          );
          const [out] =
            await tx`insert into payment_records ${tx({ ...v, recorded_by: a.id })} returning *`;
          await audit(
            tx,
            a,
            'payment-claim',
            'payment_records',
            out.id,
            o.seller_organization_id,
            null,
            out,
          );
          return out;
        });
      } else if (segments[0] === 'payments' && segments[2] === 'verify') {
        requireRole(a, ['admin', 'super_admin']);
        data = await sql.begin(async (tx) => {
          const [p] =
            await tx`select * from payment_records where id=${z.uuid().parse(segments[1])} for update`;
          assert(p, 'NOT_FOUND', 'Payment not found.', 404);
          const o = await orderAccess(a, p.order_id, tx);
          const evidence = z.string().min(10).parse(body.evidence);
          assert(
            p.recorded_by !== a.id,
            'INDEPENDENT_REVIEW_REQUIRED',
            'A payment claimant cannot verify their own claim.',
            403,
          );
          assert(p.status === 'unverified', 'INVALID_TRANSITION', 'Payment already reviewed.');
          const [out] = await tx`
update payment_records
set
  status = 'verified',
  verified_by = ${a.id},
  evidence = ${evidence}
where
  id = ${p.id}
returning
  *
`;
          await audit(
            tx,
            a,
            'verify-payment',
            'payment_records',
            p.id,
            o.seller_organization_id,
            p,
            out,
          );
          return out;
        });
      } else if (segments[0] === 'storage' && segments[1] === 'reservations' && segments[2])
        data = await storageAction(
          a,
          z.uuid().parse(segments[2]),
          segments[3],
          z
            .object({
              quantity_kg: z.number().nonnegative().optional(),
              evidence: z.string().max(2000).optional(),
            })
            .strict()
            .parse(body),
        );
      else if (segments[0] === 'transport' && segments[1] === 'quotes' && segments[3] === 'accept')
        data = await acceptQuote(a, z.uuid().parse(segments[2]));
      else if (segments[0] === 'transport' && segments[1] === 'shipments' && segments[2]) {
        const v = z
          .object({
            status: z.enum(['dispatched', 'collected', 'in_transit', 'delivered', 'failed']),
            evidence: z.string().min(3).max(2000),
            actual_charge_minor: z.number().int().nonnegative().optional(),
          })
          .strict()
          .parse(body);
        data = await shipmentAction(
          a,
          z.uuid().parse(segments[2]),
          v.status,
          v.evidence,
          v.actual_charge_minor,
        );
      } else if (path === 'account') {
        const v = z
          .object({
            full_name: z.string().min(2).max(200),
            phone: z.string().max(40).optional(),
            locale: z.string().max(30).default('en-NG'),
          })
          .strict()
          .parse(body);
        data = await sql.begin(async (tx) => {
          const [before] = await tx`select * from profiles where id=${a.id} for update`;
          const [out] = await tx`update profiles set ${tx(v)} where id=${a.id} returning *`;
          await audit(tx, a, 'profile-update', 'profiles', a.id, null, before, out);
          return out;
        });
      } else if (path === 'privacy-requests') {
        const v = z
          .object({
            kind: z.enum(['access', 'correction', 'deletion']),
            details: z.string().min(8).max(2000),
          })
          .strict()
          .parse(body);
        [data] =
          await sql`insert into privacy_requests ${sql({ ...v, user_id: a.id })} returning *`;
      } else if (path === 'media/signature') {
        const v = z
          .object({
            organization_id: z.uuid(),
            content_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
            bytes: z.number().int().positive().max(5242880),
          })
          .strict()
          .parse(body);
        await authorize(a, v.organization_id);
        data = {
          upload_endpoint: '/api/media/upload',
          method: 'POST',
          private: true,
          max_bytes: 5242880,
          validation: 'Signature is generated server-side after actual file bytes are validated.',
        };
      } else data = await createResource(a, aliases[path] || path, body);
    }
    return NextResponse.json(
      { success: true, data, requestId },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const known = error instanceof Problem,
      validation = error instanceof ZodError;
    const status = known ? error.status : validation ? 400 : 500;
    if (status === 500) await reportError('INTERNAL_ERROR', requestId);
    console.error(
      JSON.stringify({
        requestId,
        status,
        code: known ? error.code : validation ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
      }),
    );
    return NextResponse.json(
      {
        success: false,
        error: {
          code: known ? error.code : validation ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
          message: known
            ? error.message
            : validation
              ? error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ')
              : 'The operation could not be completed.',
          requestId,
        },
      },
      { status },
    );
  }
}
export { handler as GET, handler as POST, handler as PATCH };
