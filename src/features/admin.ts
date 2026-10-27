import { z } from 'zod';
import { db } from '@/lib/db';
import { authorize, requireRole, scope, type Actor } from '@/lib/auth';
import { assert } from '@/lib/errors';
import { audit } from './audit';
export async function adminOverview(a: Actor, section: string) {
  requireRole(a, ['admin', 'super_admin']);
  const ids = await scope(a),
    sql = db();
  if (section === 'users')
    return sql`
select distinct
  p.*
from
  profiles p
  left join organization_memberships m on m.user_id = p.id
where
  ${a.role === 'super_admin'}
  or m.organization_id = any (${ids}::uuid[])
order by
  p.created_at desc
limit
  100
`;
  if (section === 'organizations')
    return sql`
select
  *
from
  organizations
where
  id = any (${ids}::uuid[])
order by
  created_at desc
limit
  100
`;
  if (section === 'audit')
    return sql`
select
  *
from
  audit_logs
where
  ${a.role === 'super_admin'}
  or organization_id = any (${ids}::uuid[])
order by
  created_at desc
limit
  100
`;
  if (section === 'configuration')
    return sql`select * from algorithm_configurations order by created_at desc`;
  if (section === 'verification')
    return sql`
select
  v.*,
  o.name
from
  verification_requests v
  join organizations o on o.id = v.organization_id
where
  v.organization_id = any (${ids}::uuid[])
order by
  v.created_at desc
limit
  100
`;
  if (section === 'outbox')
    return sql`
select
  *
from
  notification_outbox
where
  organization_id = any (${ids}::uuid[])
order by
  created_at desc
limit
  100
`;
  if (section === 'privacy') {
    requireRole(a, ['super_admin']);
    return sql`select * from privacy_requests order by created_at desc limit 100`;
  }
  return [];
}
export async function adminChange(a: Actor, resource: string, id: string, raw: unknown) {
  requireRole(a, ['admin', 'super_admin']);
  return db().begin(async (tx) => {
    if (resource === 'users') {
      requireRole(a, ['super_admin']);
      const v = z
        .object({
          status: z.enum(['active', 'suspended', 'deactivated']),
          platform_role: z.enum(['member', 'coordinator', 'admin', 'super_admin']),
          region: z.string().min(1).nullable(),
        })
        .strict()
        .parse(raw);
      const [before] = await tx`select * from profiles where id=${id} for update`;
      assert(before, 'NOT_FOUND', 'User not found.', 404);
      assert(
        id !== a.id,
        'SELF_CHANGE_BLOCKED',
        'Use another super administrator to change your privileged access.',
      );
      if (
        before.platform_role === 'super_admin' &&
        (v.status !== 'active' || v.platform_role !== 'super_admin')
      ) {
        await tx`select pg_advisory_xact_lock(927314)`;
        const [n] =
          await tx`select count(*) from profiles where platform_role='super_admin' and status='active'`;
        assert(
          Number(n.count) > 1,
          'LAST_ADMIN',
          'Cannot remove the last active super administrator.',
        );
      }
      const [out] = await tx`update profiles set ${tx(v)} where id=${id} returning *`;
      await audit(tx, a, 'access-change', 'profiles', id, null, before, out);
      return out;
    }
    if (resource === 'organizations') {
      const permitted = await scope(a);
      assert(permitted.includes(id), 'FORBIDDEN', 'Organization is outside your region.', 403);
      const v = z
        .object({
          verification_status: z.enum(['pending', 'verified', 'rejected', 'suspended']),
          reason: z.string().min(8),
        })
        .strict()
        .parse(raw);
      const [before] = await tx`select * from organizations where id=${id} for update`;
      const [out] =
        await tx`update organizations set verification_status=${v.verification_status} where id=${id} returning *`;
      await tx`
update verification_requests
set
  status = ${v.verification_status === 'verified' ? 'verified' : v.verification_status === 'rejected' ? 'rejected' : 'pending'},
  reason = ${v.reason},
  reviewer_id = ${a.id}
where
  organization_id = ${id}
  and status = 'pending'
`;
      await audit(tx, a, 'verification-change', 'organizations', id, id, before, {
        ...out,
        reason: v.reason,
      });
      return out;
    }
    if (resource === 'configuration') {
      requireRole(a, ['super_admin']);
      const weights = z
        .object({
          uncommitted: z.number().min(0).max(1),
          urgency: z.number().min(0).max(1),
          storage: z.number().min(0).max(1),
          delay: z.number().min(0).max(1),
          condition: z.number().min(0).max(1),
        })
        .strict()
        .refine(
          (w) => Math.abs(Object.values(w).reduce((x, y) => x + y, 0) - 1) < 0.00001,
          'Weights must sum to one',
        );
      const v = z
        .object({
          version: z.string().min(3).max(80),
          weights,
          thresholds: z
            .object({
              moderate: z.number().min(0).max(100),
              high: z.number().min(0).max(100),
              critical: z.number().min(0).max(100),
            })
            .refine((t) => t.moderate < t.high && t.high < t.critical, 'Thresholds must increase'),
          assumptions: z.string().min(20),
        })
        .strict()
        .parse(raw);
      await tx`select pg_advisory_xact_lock(927315)`;
      const old = await tx`select * from algorithm_configurations where active`;
      await tx`update algorithm_configurations set active=false where active`;
      const [out] = await tx`
insert into
  algorithm_configurations (version, weights, thresholds, assumptions, active, created_by)
values
  (${v.version}, ${tx.json(v.weights)}, ${tx.json(v.thresholds)}, ${v.assumptions}, true, ${a.id})
returning
  *
`;
      await audit(
        tx,
        a,
        'configuration-version',
        'algorithm_configurations',
        out.id,
        null,
        old,
        out,
      );
      return out;
    }
    if (resource === 'incidents') {
      const v = z
        .object({
          status: z.enum(['open', 'investigating', 'resolved']),
          resolution: z.string().min(8),
          owner_id: z.uuid().nullable(),
        })
        .strict()
        .parse(raw);
      const [before] = await tx`select * from incidents where id=${id} for update`;
      assert(before, 'NOT_FOUND', 'Incident not found.', 404);
      await authorize(a, before.organization_id, undefined, tx);
      const [out] = await tx`update incidents set ${tx(v)} where id=${id} returning *`;
      await audit(
        tx,
        a,
        'incident-resolution',
        'incidents',
        id,
        before.organization_id,
        before,
        out,
      );
      return out;
    }
    if (resource === 'outbox') {
      const [old] = await tx`select * from notification_outbox where id=${id} for update`;
      assert(old, 'NOT_FOUND', 'Notification job not found.', 404);
      await authorize(a, old.organization_id, undefined, tx);
      assert(old.status === 'failed', 'INVALID_TRANSITION', 'Only failed jobs can be retried.');
      const [out] = await tx`
update notification_outbox
set
  status = 'pending',
  attempts = 0,
  next_attempt_at = now(),
  last_error = null
where
  id = ${id}
returning
  *
`;
      await audit(
        tx,
        a,
        'retry-notification',
        'notification_outbox',
        id,
        old.organization_id,
        old,
        out,
      );
      return out;
    }
    if (resource === 'privacy') {
      requireRole(a, ['super_admin']);
      const v = z
        .object({ status: z.enum(['open', 'processing', 'completed']) })
        .strict()
        .parse(raw);
      const [out] =
        await tx`update privacy_requests set status=${v.status} where id=${id} returning *`;
      await audit(tx, a, 'privacy-request', 'privacy_requests', id, null, null, out);
      return out;
    }
    assert(false, 'NOT_FOUND', 'Unknown administration action.', 404);
  });
}
