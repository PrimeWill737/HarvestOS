import { z } from 'zod';
import { randomBytes, createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { authorize, type Actor } from '@/lib/auth';
import { assert } from '@/lib/errors';
import { audit, notify } from './audit';
export async function organizationAction(a: Actor, action: string, raw: unknown) {
  return db().begin(async (tx) => {
    if (action === 'create') {
      const v = z
        .object({
          name: z.string().min(2).max(200),
          type: z.enum(['farmer', 'buyer', 'cooperative', 'transporter', 'storage_provider']),
          region: z.string().min(1).max(100),
        })
        .strict()
        .parse(raw);
      const [org] = await tx`insert into organizations ${tx(v)} returning *`;
      await tx`
insert into
  organization_memberships (organization_id, user_id, role)
values
  (${org.id}, ${a.id}, 'owner')
`;
      await audit(tx, a, 'create', 'organizations', org.id, org.id, null, org);
      return org;
    }
    if (action === 'invite') {
      const v = z
        .object({
          organization_id: z.uuid(),
          email: z.email(),
          role: z.enum(['manager', 'member', 'agent']),
        })
        .strict()
        .parse(raw);
      await authorize(a, v.organization_id, ['owner', 'manager'], tx);
      const token = randomBytes(32).toString('hex'),
        hash = createHash('sha256').update(token).digest('hex');
      const [inv] = await tx`
insert into
  invitations (organization_id, email, role, token_hash, expires_at)
values
  (${v.organization_id}, ${v.email.toLowerCase()}, ${v.role}, ${hash}, now() + interval '7 days')
returning
  id,
  expires_at
`;
      await audit(tx, a, 'invite', 'invitations', inv.id, v.organization_id, null, {
        email: v.email,
        role: v.role,
      });
      return { ...inv, token };
    }
    if (action === 'revoke-invite') {
      const v = z
        .object({ organization_id: z.uuid(), invitation_id: z.uuid() })
        .strict()
        .parse(raw);
      await authorize(a, v.organization_id, ['owner', 'manager'], tx);
      const [out] = await tx`
update invitations
set
  status = 'revoked'
where
  id = ${v.invitation_id}
  and organization_id = ${v.organization_id}
  and status = 'pending'
returning
  id,
  email,
  status
`;
      assert(out, 'NOT_FOUND', 'Pending invitation not found.', 404);
      await audit(tx, a, 'revoke-invite', 'invitations', out.id, v.organization_id, null, out);
      return out;
    }
    if (action === 'accept-invite') {
      const v = z
        .object({ token: z.string().length(64) })
        .strict()
        .parse(raw);
      const hash = createHash('sha256').update(v.token).digest('hex');
      const [inv] = await tx`select * from invitations where token_hash=${hash} for update`;
      assert(
        inv &&
          inv.email === a.email.toLowerCase() &&
          inv.status === 'pending' &&
          new Date(inv.expires_at) > new Date(),
        'INVALID_INVITATION',
        'Invitation is invalid, expired or addressed to another account.',
      );
      await tx`
insert into
  organization_memberships (organization_id, user_id, role)
values
  (${inv.organization_id}, ${a.id}, ${inv.role})
on conflict (organization_id, user_id) do update
set role = excluded.role,
status = 'active'
`;
      await tx`update invitations set status='accepted' where id=${inv.id}`;
      await audit(tx, a, 'accept-invite', 'invitations', inv.id, inv.organization_id, null, {
        status: 'accepted',
      });
      return { accepted: true };
    }
    if (action === 'membership') {
      const v = z
        .object({
          organization_id: z.uuid(),
          user_id: z.uuid(),
          status: z.enum(['active', 'suspended']),
        })
        .strict()
        .parse(raw);
      await authorize(a, v.organization_id, ['owner'], tx);
      assert(v.user_id !== a.id, 'SELF_CHANGE_BLOCKED', 'Cannot suspend your own membership.');
      const [old] =
        await tx`select * from organization_memberships where organization_id=${v.organization_id} and user_id=${v.user_id}`;
      assert(
        old && old.role !== 'owner',
        'OWNER_PROTECTED',
        'Owner changes require controlled administration.',
      );
      const [out] = await tx`
update organization_memberships
set
  status = ${v.status}
where
  organization_id = ${v.organization_id}
  and user_id = ${v.user_id}
returning
  *
`;
      await audit(
        tx,
        a,
        'membership',
        'organization_memberships',
        out.id,
        v.organization_id,
        old,
        out,
      );
      return out;
    }
    if (action === 'intervention') {
      const v = z
        .object({
          organization_id: z.uuid(),
          harvest_id: z.uuid(),
          action: z.string().min(3),
          reason: z.string().min(8),
        })
        .strict()
        .parse(raw);
      await authorize(a, v.organization_id, undefined, tx);
      const [h] =
        await tx`select id from harvests where id=${v.harvest_id} and organization_id=${v.organization_id}`;
      assert(h, 'FORBIDDEN', 'Harvest outside organization.', 403);
      const [out] =
        await tx`insert into recommendation_actions ${tx({ ...v, actor_id: a.id })} returning *`;
      await audit(
        tx,
        a,
        'intervention',
        'recommendation_actions',
        out.id,
        v.organization_id,
        null,
        out,
      );
      await notify(tx, v.organization_id, 'intervention.recorded', { id: out.id });
      return out;
    }
    assert(false, 'NOT_FOUND', 'Unknown organization operation.', 404);
  });
}
