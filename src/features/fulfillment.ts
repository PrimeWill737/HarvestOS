import { db } from '@/lib/db';
import { authorize, type Actor } from '@/lib/auth';
import { assert } from '@/lib/errors';
import { audit, notify } from './audit';
import { orderAccess } from './commerce';
export async function storageAction(a: Actor, id: string, action: string, input: any) {
  return db().begin(async (tx) => {
    const [r] = await tx`select * from storage_reservations where id=${id} for update`;
    assert(r, 'NOT_FOUND', 'Reservation not found.', 404);
    const [f] = await tx`
select
  f.*,
  o.verification_status
from
  storage_facilities f
  join organizations o on o.id = f.organization_id
where
  f.id = ${r.facility_id}
for update of
  f
`;
    await authorize(a, f.organization_id, ['owner', 'manager', 'member'], tx);
    if (action === 'confirm') {
      assert(
        r.status === 'requested',
        'INVALID_TRANSITION',
        'Only requested reservations can be confirmed.',
      );
      assert(
        f.verification_status === 'verified',
        'PROVIDER_UNVERIFIED',
        'Provider verification required.',
      );
      const [l] = await tx`
select
  h.crop_id
from
  harvest_lots l
  join harvests h on h.id = l.harvest_id
where
  l.id = ${r.lot_id}
`;
      assert(
        f.crop_ids.includes(l.crop_id) &&
          new Date(r.starts_at) >= new Date(f.available_from) &&
          new Date(r.ends_at) <= new Date(f.available_until) &&
          new Date(r.ends_at) > new Date(),
        'INCOMPATIBLE',
        'Crop or storage dates are not supported.',
      );
      // Serialize by facility and compute peak simultaneous usage, not a sum of disjoint bookings.
      const existing = await tx`
select
  starts_at,
  ends_at,
  quantity_kg
from
  storage_reservations
where
  facility_id = ${f.id}
  and status in ('confirmed', 'received')
  and starts_at < ${r.ends_at}
  and ends_at > ${r.starts_at}
`;
      const events = existing
        .flatMap((x) => [
          {
            t: Math.max(new Date(x.starts_at).getTime(), new Date(r.starts_at).getTime()),
            q: Number(x.quantity_kg),
          },
          {
            t: Math.min(new Date(x.ends_at).getTime(), new Date(r.ends_at).getTime()),
            q: -Number(x.quantity_kg),
          },
        ])
        .sort((a, b) => a.t - b.t || a.q - b.q);
      let used = 0,
        peak = 0;
      for (const e of events) {
        used += e.q;
        peak = Math.max(peak, used);
      }
      assert(
        peak + Number(r.quantity_kg) <= Number(f.capacity_kg),
        'CAPACITY_EXCEEDED',
        'Overlapping reservations exceed usable capacity.',
      );
    } else if (action === 'receive') {
      assert(r.status === 'confirmed', 'INVALID_TRANSITION', 'Confirm capacity first.');
      assert(
        input.quantity_kg > 0 && input.quantity_kg <= Number(r.quantity_kg) && input.evidence,
        'INVALID_INTAKE',
        'Record actual mass and evidence.',
      );
    } else if (action === 'release') {
      assert(r.status === 'received', 'INVALID_TRANSITION', 'Goods have not been received.');
      assert(
        input.quantity_kg >= 0 && input.quantity_kg <= Number(r.received_kg) && input.evidence,
        'INVALID_RELEASE',
        'Record released mass and evidence.',
      );
      if (input.quantity_kg < Number(r.received_kg))
        await tx`
insert into
  incidents (organization_id, kind, description, evidence)
values
  (${r.organization_id}, 'storage_discrepancy', ${'Storage shortfall: ' + (Number(r.received_kg) - input.quantity_kg) + ' kg'}, ${input.evidence})
`;
    } else
      assert(
        action === 'reject' && r.status === 'requested',
        'INVALID_TRANSITION',
        'Unsupported storage transition.',
      );
    const status = (
      {
        confirm: 'confirmed',
        receive: 'received',
        release: 'released',
        reject: 'rejected',
      } as Record<string, string>
    )[action];
    const [out] = await tx`
update storage_reservations
set
  status = ${status},
  received_kg = ${action === 'receive' ? input.quantity_kg : r.received_kg},
  released_kg = ${action === 'release' ? input.quantity_kg : r.released_kg},
  evidence = ${input.evidence || r.evidence}
where
  id = ${id}
returning
  *
`;
    await audit(tx, a, action, 'storage_reservations', id, f.organization_id, r, out);
    await notify(tx, r.organization_id, 'storage.' + action, { reservationId: id });
    return out;
  });
}
export async function acceptQuote(a: Actor, id: string) {
  return db().begin(async (tx) => {
    const [q] = await tx`select * from transport_quotes where id=${id} for update`;
    assert(q, 'NOT_FOUND', 'Quote not found.', 404);
    const o = await orderAccess(a, q.order_id, tx, 'seller');
    await tx`select id from orders where id=${o.id} for update`;
    assert(
      o.status === 'confirmed' && q.status === 'quoted' && q.vehicle_id && q.price_minor !== null,
      'INVALID_QUOTE',
      'An active order and provider quote are required.',
    );
    const [v] = await tx`
select
  v.*,
  g.verification_status
from
  transport_vehicles v
  join organizations g on g.id = v.organization_id
where
  v.id = ${q.vehicle_id}
for update of
  v
`;
    const [mass] = await tx`select sum(quantity_kg) as kg from order_items where order_id=${o.id}`;
    assert(
      v.verification_status === 'verified' &&
        Number(v.capacity_kg) >= Number(mass.kg) &&
        new Date(q.pickup_at) >= new Date(v.available_from) &&
        new Date(q.delivery_at) <= new Date(v.available_until),
      'VEHICLE_UNAVAILABLE',
      'Vehicle capacity or availability does not fit.',
    );
    const busy = await tx`
select
  id
from
  shipments
where
  vehicle_id = ${v.id}
  and status not in ('delivered', 'failed')
  and pickup_at < ${q.delivery_at}
  and delivery_at > ${q.pickup_at}
`;
    assert(!busy.length, 'VEHICLE_BOOKED', 'Vehicle already assigned during this interval.');
    const [out] = await tx`
insert into
  shipments (organization_id, order_id, vehicle_id, quote_id, pickup_at, delivery_at)
values
  (${v.organization_id}, ${o.id}, ${v.id}, ${id}, ${q.pickup_at}, ${q.delivery_at})
returning
  *
`;
    await tx`update transport_quotes set status='accepted' where id=${id}`;
    await audit(tx, a, 'accept', 'transport_quotes', id, o.seller_organization_id, q, out);
    return out;
  });
}
export async function shipmentAction(
  a: Actor,
  id: string,
  status: string,
  evidence: string,
  actualCharge?: number,
) {
  return db().begin(async (tx) => {
    const [s] = await tx`select * from shipments where id=${id} for update`;
    assert(s, 'NOT_FOUND', 'Shipment not found.', 404);
    await authorize(a, s.organization_id, ['owner', 'manager', 'member'], tx);
    const transitions: Record<string, string[]> = {
      assigned: ['dispatched', 'failed'],
      dispatched: ['collected', 'failed'],
      collected: ['in_transit', 'failed'],
      in_transit: ['delivered', 'failed'],
    };
    assert(
      transitions[s.status]?.includes(status),
      'INVALID_TRANSITION',
      'Invalid shipment transition.',
    );
    assert(evidence, 'EVIDENCE_REQUIRED', 'Attach evidence or an incident reason.');
    const [out] = await tx`
update shipments
set
  status = ${status},
  evidence = ${evidence},
  actual_charge_minor = ${actualCharge ?? s.actual_charge_minor},
  completed_at = ${['delivered', 'failed'].includes(status) ? new Date() : null}
where
  id = ${id}
returning
  *
`;
    if (status === 'failed')
      await tx`
insert into
  incidents (organization_id, order_id, kind, description, evidence)
values
  (${s.organization_id}, ${s.order_id}, 'failed_pickup', ${evidence}, ${evidence})
`;
    else
      await tx`
update orders
set
  status = ${status},
  updated_at = now()
where
  id = ${s.order_id}
  and status not in ('received', 'disputed', 'cancelled')
`;
    await audit(tx, a, status, 'shipments', id, s.organization_id, s, out);
    return out;
  });
}
