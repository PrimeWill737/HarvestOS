import { db } from '@/lib/db';
import { authorize, authorizeFarm, requireRole, type Actor } from '@/lib/auth';
import { assert } from '@/lib/errors';
import { schemas } from '@/lib/validation';
import { persistRisk } from './intelligence/persist';
import { audit, notify } from './audit';
export async function placeOffer(a: Actor, input: unknown, key: string) {
  const v = schemas.offers.parse(input);
  assert(
    key.length >= 8 && key.length <= 200,
    'IDEMPOTENCY_REQUIRED',
    'Provide an Idempotency-Key (8-200 characters).',
    400,
  );
  return db().begin(async (tx) => {
    await authorize(a, v.organization_id, ['owner', 'manager', 'member'], tx);
    await tx`select pg_advisory_xact_lock(hashtextextended(${a.id + ':' + key},0))`;
    const [previous] =
      await tx`select * from purchase_offers where created_by=${a.id} and idempotency_key=${key}`;
    if (previous) {
      assert(
        previous.lot_id === v.lot_id &&
          Number(previous.quantity_kg) === v.quantity_kg &&
          Number(previous.price_minor) === v.price_minor &&
          previous.requirement_id === v.requirement_id,
        'IDEMPOTENCY_CONFLICT',
        'Key already used with different terms.',
      );
      return previous;
    }
    if (v.parent_offer_id) {
      const [parent] = await tx`select * from purchase_offers where id=${v.parent_offer_id}`;
      assert(
        parent &&
          parent.organization_id === v.organization_id &&
          parent.lot_id === v.lot_id &&
          parent.requirement_id === v.requirement_id &&
          parent.status === 'countered',
        'INVALID_COUNTER',
        'Counter response must reference your countered offer.',
      );
    }
    const [r] = await tx`
select
  r.*,
  o.verification_status
from
  buyer_requirements r
  join organizations o on o.id = r.organization_id
where
  r.id = ${v.requirement_id}
`;
    const [lot] = await tx`
select
  l.*,
  h.crop_id,
  h.grade,
  h.currency,
  h.status,
  h.available_until,
  h.estimated_harvest_date,
  h.organization_id,
  f.region
from
  harvest_lots l
  join harvests h on h.id = l.harvest_id
  join farms f on f.id = h.farm_id
where
  l.id = ${v.lot_id}
`;
    assert(r && lot, 'NOT_FOUND', 'Requirement or lot not found.', 404);
    assert(
      r.organization_id === v.organization_id && lot.organization_id !== v.organization_id,
      'FORBIDDEN',
      'Buyer must own the demand and cannot buy its own harvest.',
      403,
    );
    assert(
      r.verification_status === 'verified' &&
        r.status === 'open' &&
        new Date(r.expires_at) > new Date(),
      'DEMAND_INELIGIBLE',
      'Verified, unexpired demand is required.',
    );
    assert(
      ['published', 'partially_allocated'].includes(lot.status) &&
        r.crop_id === lot.crop_id &&
        r.grade === lot.grade &&
        r.currency === lot.currency &&
        r.region === lot.region &&
        new Date(r.window_end) >= new Date(lot.estimated_harvest_date) &&
        new Date(r.window_start) <= new Date(lot.available_until),
      'INCOMPATIBLE',
      'Crop, grade, region, currency or collection window is incompatible.',
    );
    assert(
      v.quantity_kg <=
        Number(lot.total_kg) -
          Number(lot.reserved_kg) -
          Number(lot.sold_kg) -
          Number(lot.lost_kg) && v.quantity_kg <= Number(r.quantity_kg) - Number(r.allocated_kg),
      'INSUFFICIENT_STOCK',
      'Requested mass exceeds remaining stock or demand.',
    );
    assert(
      v.price_minor <= Number(r.max_price_minor) &&
        new Date(v.expires_at) > new Date() &&
        new Date(v.expires_at) <= new Date(r.expires_at),
      'INVALID_TERMS',
      'Price or offer expiry exceeds buyer terms.',
    );
    const [offer] =
      await tx`insert into purchase_offers ${tx({ ...v, currency: r.currency, created_by: a.id, idempotency_key: key })} returning *`;
    await audit(tx, a, 'create', 'purchase_offers', offer.id, v.organization_id, null, offer);
    await notify(tx, lot.organization_id, 'offer.created', { offerId: offer.id });
    return offer;
  });
}
export async function acceptOffer(a: Actor, id: string) {
  return db().begin(async (tx) => {
    const [o] = await tx`select * from purchase_offers where id=${id} for update`;
    assert(o, 'NOT_FOUND', 'Offer not found.', 404);
    const [lot] = await tx`
select
  l.*,
  h.organization_id,
  h.status as harvest_status,
  h.farm_id,
  h.id as harvest_id,
  h.available_until
from
  harvest_lots l
  join harvests h on h.id = l.harvest_id
where
  l.id = ${o.lot_id}
for update of
  l,
  h
`;
    await authorizeFarm(a, lot.farm_id, tx);
    if (o.status === 'accepted') {
      const [order] = await tx`select * from orders where offer_id=${id}`;
      return order;
    }
    assert(
      o.status === 'pending' && new Date(o.expires_at) > new Date(),
      'OFFER_EXPIRED',
      'Offer is no longer pending or has expired.',
    );
    const [r] = await tx`
select
  r.*,
  g.verification_status
from
  buyer_requirements r
  join organizations g on g.id = r.organization_id
where
  r.id = ${o.requirement_id}
for update of
  r
`;
    assert(
      r.verification_status === 'verified' &&
        r.status === 'open' &&
        new Date(r.expires_at) > new Date() &&
        new Date(lot.available_until) > new Date(),
      'DEMAND_INELIGIBLE',
      'Demand or harvest is no longer eligible.',
    );
    assert(
      ['published', 'partially_allocated'].includes(lot.harvest_status),
      'HARVEST_UNAVAILABLE',
      'Harvest is not open for allocation.',
    );
    const q = Number(o.quantity_kg);
    const [stock] = await tx`
update harvest_lots
set
  reserved_kg = reserved_kg + ${q}
where
  id = ${lot.id}
  and total_kg - reserved_kg - sold_kg - lost_kg >= ${q}
returning
  *
`;
    assert(stock, 'INSUFFICIENT_STOCK', 'Another offer has reserved the remaining quantity.');
    const [demand] = await tx`
update buyer_requirements
set
  allocated_kg = allocated_kg + ${q}
where
  id = ${r.id}
  and quantity_kg - allocated_kg >= ${q}
returning
  id
`;
    assert(demand, 'DEMAND_FILLED', 'Demand is already allocated.');
    const [order] = await tx`
insert into
  orders (offer_id, seller_organization_id, buyer_organization_id, total_minor, currency)
values
  (${id}, ${lot.organization_id}, ${o.organization_id}, ${Math.round(q * Number(o.price_minor))}, ${o.currency})
returning
  *
`;
    await tx`
insert into
  order_items (order_id, lot_id, quantity_kg, price_minor)
values
  (${order.id}, ${lot.id}, ${q}, ${o.price_minor})
`;
    await tx`
insert into
  inventory_reservations (lot_id, order_id, quantity_kg, expires_at)
values
  (${lot.id}, ${order.id}, ${q}, ${r.window_end})
`;
    await tx`update purchase_offers set status='accepted' where id=${id}`;
    await refreshHarvest(tx, lot.harvest_id);
    await audit(tx, a, 'accept', 'purchase_offers', id, lot.organization_id, o, order);
    await notify(tx, o.organization_id, 'order.confirmed', { orderId: order.id });
    return order;
  });
}
export async function refreshHarvest(tx: any, id: string) {
  await tx`
update harvests
set
  status = case
    when (
      select
        sum(total_kg - reserved_kg - sold_kg - lost_kg)
      from
        harvest_lots
      where
        harvest_id = ${id}
    ) > 0 then 'partially_allocated'
    when (
      select
        sum(reserved_kg)
      from
        harvest_lots
      where
        harvest_id = ${id}
    ) > 0 then 'allocated'
    else 'completed'
  end,
  version = version + 1,
  updated_at = now()
where
  id = ${id}
`;
  await persistRisk(tx, id);
}
export async function orderAccess(a: Actor, id: string, tx: any = db(), side?: 'buyer' | 'seller') {
  const [o] = await tx`select * from orders where id=${id}`;
  assert(o, 'NOT_FOUND', 'Order not found.', 404);
  if (side) {
    await authorize(a, o[side + '_organization_id'], undefined, tx);
    return o;
  }
  try {
    await authorize(a, o.seller_organization_id, undefined, tx);
  } catch {
    await authorize(a, o.buyer_organization_id, undefined, tx);
  }
  return o;
}
export async function cancelOrder(a: Actor, id: string, reason: string) {
  return db().begin(async (tx) => {
    const [o] = await tx`select * from orders where id=${id} for update`;
    assert(o, 'NOT_FOUND', 'Order not found.', 404);
    await orderAccess(a, id, tx);
    if (o.status === 'cancelled') return o;
    assert(
      o.status === 'confirmed',
      'CONTROLLED_RESOLUTION_REQUIRED',
      'After dispatch, open an incident for controlled resolution.',
    );
    const [i] = await tx`select * from order_items where order_id=${id}`;
    await tx`update harvest_lots set reserved_kg=reserved_kg-${i.quantity_kg} where id=${i.lot_id}`;
    await tx`update inventory_reservations set status='released' where order_id=${id}`;
    await tx`
update buyer_requirements
set
  allocated_kg = allocated_kg - ${i.quantity_kg}
where
  id = (
    select
      requirement_id
    from
      purchase_offers
    where
      id = ${o.offer_id}
  )
`;
    const [out] =
      await tx`update orders set status='cancelled',updated_at=now() where id=${id} returning *`;
    await tx`update shipments set status='failed',evidence=${reason} where order_id=${id}`;
    const [l] = await tx`select harvest_id from harvest_lots where id=${i.lot_id}`;
    await refreshHarvest(tx, l.harvest_id);
    await audit(tx, a, 'cancel', 'orders', id, o.seller_organization_id, o, { ...out, reason });
    return out;
  });
}
export async function confirmReceipt(a: Actor, id: string, input: unknown) {
  const v = schemas.receipt.parse(input);
  return db().begin(async (tx) => {
    const [o] = await tx`select * from orders where id=${id} for update`;
    assert(o, 'NOT_FOUND', 'Order not found.', 404);
    await orderAccess(a, id, tx, 'buyer');
    assert(
      ['confirmed', 'delivered'].includes(o.status),
      'INVALID_TRANSITION',
      'Receipt is already recorded or order cannot be received.',
    );
    const [i] = await tx`select * from order_items where order_id=${id}`;
    assert(
      Math.abs(v.received_kg + v.rejected_kg - Number(i.quantity_kg)) < 0.0005,
      'QUANTITY_MISMATCH',
      'Received and rejected mass must reconcile with ordered mass.',
    );
    const [out] = await tx`
update orders
set
  status = ${v.rejected_kg > 0 ? 'disputed' : 'received'},
  received_kg = ${v.received_kg},
  rejected_kg = ${v.rejected_kg},
  receipt_grade = ${v.grade},
  receipt_evidence = ${v.evidence},
  receipt_recorded_by = ${a.id},
  updated_at = now()
where
  id = ${id}
returning
  *
`;
    if (v.rejected_kg > 0)
      await tx`
insert into
  incidents (organization_id, order_id, kind, description, evidence)
values
  (${o.seller_organization_id}, ${id}, 'receipt_discrepancy', ${'Rejected ' + v.rejected_kg + ' kg'}, ${v.evidence})
`;
    await audit(tx, a, 'confirm-receipt', 'orders', id, o.buyer_organization_id, o, out);
    return out;
  });
}
export async function verifyReceipt(
  a: Actor,
  id: string,
  input: {
    transport_minor?: number;
    storage_minor?: number;
    fees_minor?: number;
    resolution?: string;
  },
) {
  requireRole(a, ['coordinator', 'admin', 'super_admin']);
  return db().begin(async (tx) => {
    const [o] = await tx`select * from orders where id=${id} for update`;
    assert(o, 'NOT_FOUND', 'Order not found.', 404);
    await authorize(a, o.seller_organization_id, undefined, tx);
    if (o.receipt_verified) return o;
    assert(
      o.receipt_recorded_by !== a.id,
      'INDEPENDENT_REVIEW_REQUIRED',
      'The receipt recorder cannot independently verify the same receipt.',
      403,
    );
    assert(
      ['received', 'disputed'].includes(o.status) && o.receipt_evidence,
      'RECEIPT_REQUIRED',
      'Buyer receipt and evidence are required.',
    );
    assert(
      Number(o.rejected_kg) === 0 || Boolean(input.resolution),
      'RESOLUTION_REQUIRED',
      'Document inspection and return/loss resolution for rejected mass.',
    );
    const [i] = await tx`select * from order_items where order_id=${id}`;
    const [l] = await tx`select * from harvest_lots where id=${i.lot_id} for update`;
    await tx`
update harvest_lots
set
  reserved_kg = reserved_kg - ${i.quantity_kg},
  sold_kg = sold_kg + ${o.received_kg}
where
  id = ${i.lot_id}
`;
    // Rejected stock returns to available balance. Any physical loss requires a separate loss event.
    if (Number(o.received_kg) > 0)
      await tx`
insert into
  inventory_movements (lot_id, order_id, kind, quantity_kg, verified, evidence, actor_id)
values
  (${i.lot_id}, ${id}, 'sold', ${o.received_kg}, true, ${o.receipt_evidence}, ${a.id})
`;
    if (Number(o.rejected_kg) > 0)
      await tx`
insert into
  inventory_movements (lot_id, order_id, kind, quantity_kg, verified, evidence, actor_id)
values
  (${i.lot_id}, ${id}, 'returned', ${o.rejected_kg}, true, ${input.resolution!}, ${a.id})
`;
    await tx`update inventory_reservations set status='fulfilled' where order_id=${id}`;
    await tx`
update buyer_requirements
set
  allocated_kg = allocated_kg - ${o.rejected_kg}
where
  id = (
    select
      requirement_id
    from
      purchase_offers
    where
      id = ${o.offer_id}
  )
`;
    const [out] = await tx`
update orders
set
  receipt_verified = true,
  status = 'received',
  updated_at = now()
where
  id = ${id}
returning
  *
`;
    await tx`
insert into
  impact_measurements (
    organization_id,
    order_id,
    sold_kg,
    revenue_minor,
    transport_minor,
    storage_minor,
    fees_minor,
    verified_by
  )
values
  (${o.seller_organization_id}, ${id}, ${o.received_kg}, ${Math.round(Number(o.received_kg) * Number(i.price_minor))}, ${input.transport_minor ?? null}, ${input.storage_minor ?? null}, ${input.fees_minor ?? null}, ${a.id})
`;
    await refreshHarvest(tx, l.harvest_id);
    await audit(tx, a, 'verify-receipt', 'orders', id, o.seller_organization_id, o, out);
    return out;
  });
}
export async function recordLoss(a: Actor, lotId: string, input: unknown) {
  const v = schemas.loss.parse(input);
  return db().begin(async (tx) => {
    const [l] = await tx`
select
  l.*,
  h.organization_id
from
  harvest_lots l
  join harvests h on h.id = l.harvest_id
where
  l.id = ${lotId}
for update of
  l
`;
    assert(l, 'NOT_FOUND', 'Lot not found.', 404);
    await authorize(a, l.organization_id, ['owner', 'manager', 'agent'], tx);
    const [out] = await tx`
update harvest_lots
set
  lost_kg = lost_kg + ${v.quantity_kg}
where
  id = ${lotId}
  and total_kg - reserved_kg - sold_kg - lost_kg >= ${v.quantity_kg}
returning
  *
`;
    assert(out, 'INSUFFICIENT_STOCK', 'Cannot report loss against allocated or unavailable stock.');
    const verified =
      ['coordinator', 'admin', 'super_admin'].includes(a.role) && Boolean(v.evidence);
    await tx`
insert into
  inventory_movements (lot_id, kind, quantity_kg, verified, evidence, actor_id)
values
  (${lotId}, 'lost', ${v.quantity_kg}, ${verified}, ${v.evidence || v.declaration}, ${a.id})
`;
    await refreshHarvest(tx, l.harvest_id);
    await audit(tx, a, 'loss', 'harvest_lots', lotId, l.organization_id, l, {
      ...out,
      declaration: v.declaration,
      verified,
    });
    return out;
  });
}
