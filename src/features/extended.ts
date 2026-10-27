import { z } from 'zod';
import { db } from '@/lib/db';
import { authorize, requireRole, scope, type Actor } from '@/lib/auth';
import { assert } from '@/lib/errors';
import { audit } from './audit';
export async function extendedRead(a: Actor, kind: string) {
  const sql = db(),
    ids = await scope(a);
  if (kind === 'delegations')
    return sql`
select
  d.*,
  f.name as farm
from
  farm_delegations d
  join farms f on f.id = d.farm_id
where
  d.organization_id = any (${ids}::uuid[])
  or f.organization_id = any (${ids}::uuid[])
`;
  if (kind === 'batches')
    return sql`select * from aggregation_batches where organization_id=any(${ids}::uuid[])`;
  if (kind === 'transport/requests') {
    const [provider] = await sql`
select
  id
from
  organizations
where
  id = any (${ids}::uuid[])
  and type = 'transporter'
  and verification_status = 'verified'
`;
    assert(
      provider || ['coordinator', 'admin', 'super_admin'].includes(a.role),
      'PROVIDER_REQUIRED',
      'Verified transport provider access required.',
      403,
    );
    return sql`
select
  q.id,
  q.order_id,
  q.pickup_at,
  q.delivery_at,
  q.currency,
  q.status,
  f.region,
  sum(i.quantity_kg) as quantity_kg
from
  transport_quotes q
  join orders o on o.id = q.order_id
  join order_items i on i.order_id = o.id
  join harvest_lots l on l.id = i.lot_id
  join harvests h on h.id = l.harvest_id
  join farms f on f.id = h.farm_id
where
  q.status = 'requested'
  and o.status = 'confirmed'
group by
  q.id,
  f.region
limit
  100
`;
  }
  if (kind === 'policies') {
    requireRole(a, ['admin', 'super_admin']);
    return sql`select * from operational_policies order by created_at desc`;
  }
  return [];
}
export async function extendedWrite(a: Actor, kind: string, raw: unknown, id?: string) {
  return db().begin(async (tx) => {
    if (kind === 'delegations') {
      const v = z
        .object({
          farm_id: z.uuid(),
          organization_id: z.uuid(),
          expires_at: z.iso.datetime({ offset: true }),
        })
        .strict()
        .parse(raw);
      const [farm] = await tx`select * from farms where id=${v.farm_id}`;
      assert(farm, 'NOT_FOUND', 'Farm not found.', 404);
      await authorize(a, farm.organization_id, ['owner', 'manager'], tx);
      const [cooperative] = await tx`select * from organizations where id=${v.organization_id}`;
      assert(
        cooperative?.type === 'cooperative' && cooperative.verification_status === 'verified',
        'COOPERATIVE_UNVERIFIED',
        'Delegate only to a verified cooperative.',
      );
      assert(
        new Date(v.expires_at) > new Date(),
        'INVALID_EXPIRY',
        'Delegation must expire in the future.',
      );
      const [out] = await tx`
insert into
  farm_delegations ${tx(v)}
on conflict (farm_id, organization_id) do update
set
  expires_at = excluded.expires_at
returning
  *
`;
      await audit(
        tx,
        a,
        'delegate-farm',
        'farm_delegations',
        out.id,
        farm.organization_id,
        null,
        out,
      );
      return out;
    }
    if (kind === 'batches') {
      const v = z
        .object({
          organization_id: z.uuid(),
          name: z.string().min(2),
          lot_ids: z.array(z.uuid()).min(1),
        })
        .strict()
        .parse(raw);
      const org = await authorize(a, v.organization_id, ['owner', 'manager', 'agent'], tx);
      assert(
        org.type === 'cooperative',
        'WRONG_ORGANIZATION_TYPE',
        'Aggregation requires a cooperative.',
      );
      const lots = await tx`
select
  l.id
from
  harvest_lots l
  join harvests h on h.id = l.harvest_id
where
  l.id = any (${v.lot_ids}::uuid[])
  and (
    h.organization_id = ${v.organization_id}
    or exists (
      select
        1
      from
        farm_delegations d
      where
        d.farm_id = h.farm_id
        and d.organization_id = ${v.organization_id}
        and d.expires_at > now()
    )
  )
`;
      assert(
        lots.length === new Set(v.lot_ids).size,
        'FORBIDDEN',
        'Batch includes an undelegated farm.',
        403,
      );
      const [out] = await tx`insert into aggregation_batches ${tx(v)} returning *`;
      await audit(
        tx,
        a,
        'create-batch',
        'aggregation_batches',
        out.id,
        v.organization_id,
        null,
        out,
      );
      return out;
    }
    if (kind === 'split-lot') {
      const v = z
        .object({ quantity_kg: z.number().positive(), label: z.string().min(2) })
        .strict()
        .parse(raw);
      const [lot] = await tx`
select
  l.*,
  h.organization_id
from
  harvest_lots l
  join harvests h on h.id = l.harvest_id
where
  l.id = ${id!}
for update of
  l
`;
      assert(lot, 'NOT_FOUND', 'Lot not found.', 404);
      await authorize(a, lot.organization_id, ['owner', 'manager', 'agent'], tx);
      assert(
        v.quantity_kg <
          Number(lot.total_kg) -
            Number(lot.reserved_kg) -
            Number(lot.sold_kg) -
            Number(lot.lost_kg),
        'INVALID_SPLIT',
        'Split must leave a positive source balance and cannot move committed stock.',
      );
      await tx`update harvest_lots set total_kg=total_kg-${v.quantity_kg} where id=${id!}`;
      const [out] =
        await tx`insert into harvest_lots(harvest_id,label,total_kg) values(${lot.harvest_id},${v.label},${v.quantity_kg}) returning *`;
      await audit(tx, a, 'split-lot', 'harvest_lots', lot.id, lot.organization_id, lot, out);
      return out;
    }
    if (kind === 'outcome') {
      const v = z
        .object({
          harvest_id: z.uuid(),
          reported_sold_kg: z.number().nonnegative(),
          reported_lost_kg: z.number().nonnegative(),
          reported_held_kg: z.number().nonnegative(),
          evidence: z.string().min(8),
        })
        .strict()
        .parse(raw);
      const [h] = await tx`select * from harvests where id=${v.harvest_id}`;
      assert(h, 'NOT_FOUND', 'Harvest not found.', 404);
      await authorize(a, h.organization_id, ['owner', 'manager', 'agent'], tx);
      const [mass] = await tx`
select
  sum(total_kg) as total,
  sum(sold_kg) as sold,
  sum(lost_kg) as lost,
  sum(total_kg - sold_kg - lost_kg) as held
from
  harvest_lots
where
  harvest_id = ${h.id}
`;
      assert(
        Math.abs(
          v.reported_sold_kg + v.reported_lost_kg + v.reported_held_kg - Number(mass.total),
        ) < 0.0005,
        'UNRECONCILED_OUTCOME',
        'Reported sold, lost and held mass must equal total mass.',
      );
      const [out] =
        await tx`insert into harvest_outcomes ${tx({ ...v, organization_id: h.organization_id, submitted_by: a.id })} returning *`;
      if (
        Math.abs(v.reported_sold_kg - Number(mass.sold)) +
          Math.abs(v.reported_lost_kg - Number(mass.lost)) >
        0.001
      )
        await tx`
insert into
  incidents (organization_id, kind, description, evidence)
values
  (
    ${h.organization_id},
    'inventory_discrepancy',
    'End-of-harvest report differs from ledger; inspection required.',
    ${v.evidence}
  )
`;
      await audit(
        tx,
        a,
        'outcome-report',
        'harvest_outcomes',
        out.id,
        h.organization_id,
        null,
        out,
      );
      return out;
    }
    if (kind === 'catalog') {
      requireRole(a, ['super_admin']);
      const v = z
        .discriminatedUnion('catalog', [
          z.object({
            catalog: z.literal('crops'),
            name: z.string().min(2),
            handling_hours: z.number().int().positive(),
          }),
          z.object({
            catalog: z.literal('units'),
            code: z.string().min(1),
            label: z.string().min(2),
            measurement_type: z.enum(['mass', 'count', 'volume']),
            kg_factor: z.number().positive().nullable(),
          }),
        ])
        .parse(raw);
      const { catalog, ...values } = v;
      const [out] = await tx`insert into ${tx(catalog)} ${tx(values)} returning *`;
      await audit(tx, a, 'catalog-create', catalog, out.id, null, null, out);
      return out;
    }
    if (kind === 'policies') {
      requireRole(a, ['super_admin']);
      const v = z
        .object({
          version: z.string().min(3),
          settings: z
            .object({
              pickup_grace_hours: z.number().min(0).max(168),
              incident_escalation_hours: z.number().min(1).max(720),
              retention_days: z.number().int().min(30),
              currency: z.string().regex(/^[A-Z]{3}$/),
              timezone: z.string().min(3),
            })
            .strict(),
          reason: z.string().min(10),
        })
        .strict()
        .parse(raw);
      const [out] = await tx`
insert into
  operational_policies (version, settings, reason, created_by)
values
  (${v.version}, ${tx.json(v.settings)}, ${v.reason}, ${a.id})
returning
  *
`;
      await audit(tx, a, 'policy-version', 'operational_policies', out.id, null, null, out);
      return out;
    }
    assert(false, 'NOT_FOUND', 'Unknown operation.', 404);
  });
}
