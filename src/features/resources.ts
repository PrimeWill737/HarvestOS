import { db } from '@/lib/db';
import { authorize, authorizeFarm, scope, type Actor } from '@/lib/auth';
import { assert, Problem } from '@/lib/errors';
import { schemas } from '@/lib/validation';
import { audit } from './audit';
import { assessRisk, matchDemand } from './intelligence/engine';
import { orderAccess } from './commerce';
const tables: Record<string, string> = {
  farms: 'farms',
  harvests: 'harvests',
  requirements: 'buyer_requirements',
  offers: 'purchase_offers',
  orders: 'orders',
  vehicles: 'transport_vehicles',
  facilities: 'storage_facilities',
  reservations: 'storage_reservations',
  shipments: 'shipments',
  quotes: 'transport_quotes',
  incidents: 'incidents',
  destinations: 'destinations',
  saved_suppliers: 'saved_suppliers',
  verification: 'verification_requests',
};
export async function listResource(a: Actor, resource: string, cursor?: string) {
  const ids = await scope(a),
    sql = db(),
    limit = 50;
  assert(tables[resource], 'NOT_FOUND', 'Unknown resource.', 404);
  let rows: any[] = [];
  const after = cursor || '00000000-0000-0000-0000-000000000000';
  if (resource === 'farms')
    rows = await sql`
select
  f.id,
  f.organization_id,
  f.name,
  f.address_description,
  f.region,
  extensions.ST_Y (f.location::extensions.geometry) as latitude,
  extensions.ST_X (f.location::extensions.geometry) as longitude
from
  farms f
where
  (
    f.organization_id = any (${ids}::uuid[])
    or exists (
      select
        1
      from
        farm_delegations d
      where
        d.farm_id = f.id
        and d.organization_id = any (${ids}::uuid[])
        and d.expires_at > now()
    )
  )
  and f.id > ${after}::uuid
order by
  f.id
limit
  ${limit + 1}
`;
  else if (resource === 'harvests')
    rows = await sql`
select
  h.*,
  c.name as crop,
  (
    select
      coalesce(sum(total_kg - reserved_kg - sold_kg - lost_kg), 0)
    from
      harvest_lots
    where
      harvest_id = h.id
  ) as available_kg,
  (
    select
      coalesce(sum(reserved_kg), 0)
    from
      harvest_lots
    where
      harvest_id = h.id
  ) as reserved_kg,
  (
    select
      coalesce(sum(sold_kg), 0)
    from
      harvest_lots
    where
      harvest_id = h.id
  ) as sold_kg,
  (
    select
      coalesce(sum(lost_kg), 0)
    from
      harvest_lots
    where
      harvest_id = h.id
  ) as lost_kg
from
  harvests h
  join crops c on c.id = h.crop_id
where
  (
    h.organization_id = any (${ids}::uuid[])
    or exists (
      select
        1
      from
        farm_delegations d
      where
        d.farm_id = h.farm_id
        and d.organization_id = any (${ids}::uuid[])
        and d.expires_at > now()
    )
  )
  and h.id > ${after}::uuid
order by
  h.id
limit
  ${limit + 1}
`;
  else if (resource === 'orders')
    rows = await sql`
select
  *
from
  orders
where
  (
    seller_organization_id = any (${ids}::uuid[])
    or buyer_organization_id = any (${ids}::uuid[])
  )
  and id > ${after}::uuid
order by
  id
limit
  ${limit + 1}
`;
  else if (resource === 'offers')
    rows = await sql`
select
  p.*
from
  purchase_offers p
  join harvest_lots l on l.id = p.lot_id
  join harvests h on h.id = l.harvest_id
where
  (
    p.organization_id = any (${ids}::uuid[])
    or h.organization_id = any (${ids}::uuid[])
  )
  and p.id > ${after}::uuid
order by
  p.id
limit
  ${limit + 1}
`;
  else if (resource === 'reservations')
    rows = await sql`
select
  r.*
from
  storage_reservations r
  join storage_facilities f on f.id = r.facility_id
where
  (
    r.organization_id = any (${ids}::uuid[])
    or f.organization_id = any (${ids}::uuid[])
  )
  and r.id > ${after}::uuid
order by
  r.id
limit
  ${limit + 1}
`;
  else if (resource === 'quotes')
    rows = await sql`
select
  q.*
from
  transport_quotes q
  join orders o on o.id = q.order_id
where
  (
    q.organization_id = any (${ids}::uuid[])
    or o.seller_organization_id = any (${ids}::uuid[])
    or o.buyer_organization_id = any (${ids}::uuid[])
  )
  and q.id > ${after}::uuid
order by
  q.id
limit
  ${limit + 1}
`;
  else
    rows = await sql`
select
  *
from
  ${sql(tables[resource])}
where
  organization_id = any (${ids}::uuid[])
  and id > ${after}::uuid
order by
  id
limit
  ${limit + 1}
`;
  return {
    items: rows.slice(0, limit),
    nextCursor: rows.length > limit ? rows[limit - 1].id : null,
  };
}
export async function createResource(a: Actor, resource: string, input: unknown) {
  assert(
    [
      'farms',
      'harvests',
      'requirements',
      'vehicles',
      'facilities',
      'reservations',
      'incidents',
      'quotes',
      'destinations',
      'saved_suppliers',
      'verification',
    ].includes(resource),
    'NOT_FOUND',
    'Unknown creation endpoint.',
    404,
  );
  const v: any = (schemas as any)[resource].parse(input);
  return db().begin(async (tx) => {
    const org = await authorize(a, v.organization_id, ['owner', 'manager', 'member', 'agent'], tx);
    const types: Record<string, string[]> = {
      farms: ['farmer', 'cooperative'],
      harvests: ['farmer', 'cooperative'],
      requirements: ['buyer'],
      vehicles: ['transporter'],
      facilities: ['storage_provider'],
      destinations: ['buyer'],
      saved_suppliers: ['buyer'],
    };
    assert(
      !types[resource] || types[resource].includes(org.type),
      'WRONG_ORGANIZATION_TYPE',
      'Select an organization with the appropriate stakeholder type.',
      403,
    );
    if (resource === 'harvests') {
      const [farm] = await tx`select * from farms where id=${v.farm_id}`;
      assert(farm, 'NOT_FOUND', 'Farm not found.', 404);
      await authorizeFarm(a, farm.id, tx);
      v.organization_id = farm.organization_id;
      assert(
        new Date(v.available_until) > new Date(v.estimated_harvest_date),
        'INVALID_DATES',
        'Availability must end after harvest date.',
      );
    }
    if (resource === 'requirements')
      assert(
        org.verification_status === 'verified' && new Date(v.expires_at) > new Date(),
        'VERIFICATION_REQUIRED',
        'Buyer verification and future expiry are required.',
      );
    if (resource === 'reservations') {
      const [lot] = await tx`
select
  l.*,
  h.organization_id
from
  harvest_lots l
  join harvests h on h.id = l.harvest_id
where
  l.id = ${v.lot_id}
`;
      assert(
        lot && lot.organization_id === v.organization_id,
        'FORBIDDEN',
        'Reserve storage only for your own lot.',
        403,
      );
      assert(
        v.quantity_kg <= Number(lot.total_kg) - Number(lot.sold_kg) - Number(lot.lost_kg),
        'INVALID_QUANTITY',
        'Storage mass exceeds held stock.',
      );
    }
    if (resource === 'quotes') {
      if (v.vehicle_id) {
        const [vehicle] = await tx`select * from transport_vehicles where id=${v.vehicle_id}`;
        assert(
          vehicle?.organization_id === v.organization_id &&
            org.type === 'transporter' &&
            org.verification_status === 'verified',
          'FORBIDDEN',
          'Only the verified vehicle provider may quote.',
          403,
        );
        assert(v.price_minor, 'PRICE_REQUIRED', 'A provider quote requires a price.');
        const [request] = await tx`
select
  q.id
from
  transport_quotes q
  join orders o on o.id = q.order_id
where
  q.order_id = ${v.order_id}
  and q.status = 'requested'
  and o.status = 'confirmed'
`;
        assert(
          request,
          'REQUEST_REQUIRED',
          'A coordinator or order party must first request a quote.',
        );
        v.status = 'quoted';
      } else {
        await orderAccess(a, v.order_id, tx);
        v.status = 'requested';
      }
    }
    if (resource === 'incidents' && v.order_id) await orderAccess(a, v.order_id, tx);
    let row: any;
    if (resource === 'farms') {
      const { latitude, longitude, ...rest } = v;
      [row] = await tx`insert into farms ${tx(rest)} returning *`;
      if (latitude !== undefined && longitude !== undefined)
        await tx`
update farms
set
  location = extensions.ST_SetSRID (extensions.ST_MakePoint (${longitude}, ${latitude}), 4326)::extensions.geography
where
  id = ${row.id}
`;
    } else [row] = await tx`insert into ${tx(tables[resource])} ${tx(v)} returning *`;
    await audit(tx, a, 'create', tables[resource], row.id, v.organization_id, null, row);
    return row;
  });
}
export async function harvestAccess(a: Actor, id: string) {
  const [h] = await db()`
select
  h.*,
  c.name as crop,
  c.handling_hours,
  f.region
from
  harvests h
  join crops c on c.id = h.crop_id
  join farms f on f.id = h.farm_id
where
  h.id = ${id}
`;
  assert(h, 'NOT_FOUND', 'Harvest not found.', 404);
  await authorizeFarm(a, h.farm_id);
  return h;
}
export async function publishHarvest(a: Actor, id: string) {
  return db().begin(async (tx) => {
    const [h] = await tx`
select
  h.*,
  u.kg_factor
from
  harvests h
  join units u on u.id = h.unit_id
where
  h.id = ${id}
for update of
  h
`;
    assert(h, 'NOT_FOUND', 'Harvest not found.', 404);
    await authorizeFarm(a, h.farm_id, tx);
    assert(
      h.status === 'draft' && new Date(h.available_until) > new Date(),
      'INVALID_PUBLICATION',
      'Only eligible drafts can be published.',
    );
    const mass = h.measured_kg
      ? Number(h.measured_kg)
      : h.kg_factor
        ? Number(h.total_quantity) * Number(h.kg_factor)
        : 0;
    assert(
      mass > 0,
      'MASS_REQUIRED',
      'Weigh local units before publishing. Baskets have no universal conversion.',
    );
    await tx`insert into harvest_lots(harvest_id,label,total_kg) values(${id},'Main lot',${mass})`;
    const [out] = await tx`
update harvests
set
  status = 'published',
  version = version + 1,
  updated_at = now()
where
  id = ${id}
returning
  *
`;
    await audit(tx, a, 'publish', 'harvests', id, h.organization_id, h, out);
    return out;
  });
}
export async function evaluateRisk(a: Actor, id: string) {
  const h = await harvestAccess(a, id);
  const sql = db();
  const [mass] = await sql`
select
  coalesce(sum(total_kg), 0) as total,
  coalesce(sum(total_kg - reserved_kg - sold_kg - lost_kg), 0) as available
from
  harvest_lots
where
  harvest_id = ${id}
`;
  assert(
    Number(mass.total) > 0,
    'PUBLISH_FIRST',
    'Publish a measured harvest before assessing risk.',
  );
  const [config] = await sql`select * from algorithm_configurations where active=true`;
  assert(config, 'CONFIGURATION_REQUIRED', 'Seed the algorithm configuration.');
  const result = assessRisk(
    {
      eligibleKg: Number(mass.total),
      availableKg: Number(mass.available),
      harvestAt: h.actual_harvest_date || h.estimated_harvest_date,
      handlingHours: h.handling_hours,
      storageAdequacy: Number(h.storage_adequacy),
      delayHours: Number(h.delay_hours),
      conditionRisk: Number(h.condition_risk),
    },
    new Date(),
    config.weights,
    config.thresholds,
  );
  const [out] = await sql`
insert into
  risk_assessments (harvest_id, model_version, score, level, factors, assumptions)
values
  (${id}, ${config.version}, ${result.score}, ${result.level}, ${sql.json(result.factors)}, ${sql.json([...result.assumptions, config.assumptions])})
returning
  *
`;
  return out;
}
export async function harvestMatches(a: Actor, id: string) {
  const h = await harvestAccess(a, id);
  const sql = db();
  const [mass] = await sql`
select
  coalesce(sum(total_kg - reserved_kg - sold_kg - lost_kg), 0) as available
from
  harvest_lots
where
  harvest_id = ${id}
`;
  const rows = await sql`
select
  r.*,
  o.name as buyer,
  o.verification_status
from
  buyer_requirements r
  join organizations o on o.id = r.organization_id
where
  r.status = 'open'
  and r.organization_id <> ${h.organization_id}
`;
  const matches = matchDemand(
    {
      cropId: h.crop_id,
      grade: h.grade,
      availableKg: Number(mass.available),
      readyAt: h.actual_harvest_date || h.estimated_harvest_date,
      availableUntil: h.available_until,
      region: h.region,
      currency: h.currency,
      targetPriceMinor: Number(h.price_minor),
    },
    rows.map((r) => ({
      id: r.id,
      cropId: r.crop_id,
      grade: r.grade,
      verified: r.verification_status === 'verified',
      standing: r.verification_status === 'verified',
      expiresAt: r.expires_at,
      windowStart: r.window_start,
      windowEnd: r.window_end,
      region: r.region,
      currency: r.currency,
      quantityKg: Number(r.quantity_kg) - Number(r.allocated_kg),
      priceMinor: Number(r.max_price_minor),
      transportMinor: null,
      storageMinor: null,
      feesMinor: null,
      reliability: null,
    })),
  );
  for (const m of matches)
    await sql`
insert into
  match_recommendations (harvest_id, requirement_id, score, explanation)
values
  (${id}, ${m.id}, ${m.score}, ${sql.json(m)})
`;
  return matches.map((m) => ({ ...m, buyer: rows.find((r) => r.id === m.id)?.buyer }));
}
export async function marketplace() {
  return db()`
select
  h.id,
  h.crop_id,
  c.name as crop,
  h.grade,
  h.variety,
  h.estimated_harvest_date,
  h.available_until,
  h.price_minor,
  h.currency,
  o.name as supplier,
  f.region,
  l.id as lot_id,
  l.total_kg - l.reserved_kg - l.sold_kg - l.lost_kg as available_kg
from
  harvests h
  join harvest_lots l on l.harvest_id = h.id
  join crops c on c.id = h.crop_id
  join farms f on f.id = h.farm_id
  join organizations o on o.id = h.organization_id
where
  h.status in ('published', 'partially_allocated')
  and h.available_until > now()
  and o.verification_status <> 'suspended'
  and l.total_kg - l.reserved_kg - l.sold_kg - l.lost_kg > 0
order by
  h.available_until
limit
  100
`;
}
export async function impact(a: Actor) {
  const ids = await scope(a),
    sql = db();
  const [r] = await sql`
select
  coalesce(sum(sold_kg), 0) as verified_sold_kg,
  count(*) as verified_transactions,
  coalesce(sum(revenue_minor), 0) as contracted_revenue_minor,
  sum(
    case
      when transport_minor is not null
      and storage_minor is not null
      and fees_minor is not null then revenue_minor - transport_minor - storage_minor - fees_minor
    end
  ) as net_proceeds_minor,
  count(*) filter (
    where
      transport_minor is null
      or storage_minor is null
      or fees_minor is null
  ) as missing_cost_records
from
  impact_measurements
where
  organization_id = any (${ids}::uuid[])
  and verified_by is not null
`;
  const [stock] = await sql`
select
  coalesce(sum(l.total_kg - l.reserved_kg - l.sold_kg - l.lost_kg), 0) as available_kg,
  coalesce(sum(l.reserved_kg), 0) as reserved_kg,
  coalesce(sum(l.lost_kg), 0) as reported_lost_kg
from
  harvest_lots l
  join harvests h on h.id = l.harvest_id
where
  h.organization_id = any (${ids}::uuid[])
`;
  const byCurrency = await sql`
select
  o.currency,
  sum(m.revenue_minor) as revenue_minor,
  sum(
    case
      when m.transport_minor is not null
      and m.storage_minor is not null
      and m.fees_minor is not null then m.revenue_minor - m.transport_minor - m.storage_minor - m.fees_minor
    end
  ) as net_minor
from
  impact_measurements m
  join orders o on o.id = m.order_id
where
  m.organization_id = any (${ids}::uuid[])
  and m.verified_by is not null
group by
  o.currency
`;
  const [operations] = await sql`
select
  count(*) as order_count,
  count(*) filter (
    where
      receipt_verified
  ) as fulfilled_orders,
  count(*) filter (
    where
      status = 'disputed'
  ) as disputed_orders,
  count(*) filter (
    where
      status = 'cancelled'
  ) as cancelled_orders
from
  orders
where
  seller_organization_id = any (${ids}::uuid[])
  or buyer_organization_id = any (${ids}::uuid[])
`;
  const [logistics] = await sql`
select
  count(*) as shipment_count,
  count(*) filter (
    where
      status = 'failed'
  ) as failed_pickups,
  count(*) filter (
    where
      status = 'delivered'
  ) as delivered_shipments
from
  shipments
where
  organization_id = any (${ids}::uuid[])
  or order_id in (
    select
      id
    from
      orders
    where
      seller_organization_id = any (${ids}::uuid[])
      or buyer_organization_id = any (${ids}::uuid[])
  )
`;
  return {
    ...r,
    ...stock,
    ...operations,
    ...logistics,
    by_currency: byCurrency,
    contracted_revenue_minor:
      byCurrency.length === 1 && byCurrency[0].currency === 'NGN'
        ? byCurrency[0].revenue_minor
        : null,
    net_proceeds_minor:
      byCurrency.length === 1 && byCurrency[0].currency === 'NGN' ? byCurrency[0].net_minor : null,
    avoided_loss_kg: null,
    disclosure:
      'Verified sold mass is not avoided loss. Avoided loss requires a credible measured baseline. Revenue is contracted value; payment verification is separate.',
  };
}
