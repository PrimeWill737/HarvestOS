import { z } from 'zod';
import { db } from '@/lib/db';
import { authorize, type Actor } from '@/lib/auth';
import { assert } from '@/lib/errors';
import { audit } from './audit';
export async function updateResource(a: Actor, kind: string, id: string, raw: unknown) {
  const tables: Record<string, string> = {
    requirements: 'buyer_requirements',
    vehicles: 'transport_vehicles',
    facilities: 'storage_facilities',
    farms: 'farms',
  };
  assert(tables[kind], 'NOT_FOUND', 'Unknown update route.', 404);
  return db().begin(async (tx) => {
    const [before] = await tx`select * from ${tx(tables[kind])} where id=${id} for update`;
    assert(before, 'NOT_FOUND', 'Record not found.', 404);
    await authorize(a, before.organization_id, ['owner', 'manager'], tx);
    let changes: any;
    if (kind === 'requirements') {
      changes = z
        .object({
          status: z.enum(['open', 'closed']).optional(),
          quantity_kg: z.number().positive().optional(),
          max_price_minor: z.number().int().positive().optional(),
          expires_at: z.iso.datetime({ offset: true }).optional(),
        })
        .strict()
        .parse(raw);
      assert(
        changes.quantity_kg === undefined || changes.quantity_kg >= Number(before.allocated_kg),
        'ALLOCATED_DEMAND',
        'Quantity cannot fall below allocated demand.',
      );
      if (changes.expires_at)
        assert(
          new Date(changes.expires_at) <= new Date(before.window_end) &&
            new Date(changes.expires_at) > new Date(),
          'INVALID_EXPIRY',
          'Demand expiry must be within the collection window.',
        );
    } else if (kind === 'farms')
      changes = z
        .object({
          name: z.string().min(2).optional(),
          address_description: z.string().min(2).optional(),
        })
        .strict()
        .parse(raw);
    else {
      changes = z
        .object({
          name: z.string().min(2).optional(),
          capacity_kg: z.number().positive().optional(),
          available_from: z.iso.datetime({ offset: true }).optional(),
          available_until: z.iso.datetime({ offset: true }).optional(),
          ...(kind === 'facilities'
            ? {
                price_minor: z.number().int().nonnegative().optional(),
                conditions: z.string().min(3).optional(),
              }
            : {}),
        })
        .strict()
        .parse(raw);
      const busy =
        kind === 'vehicles'
          ? await tx`select id from shipments where vehicle_id=${id} and status not in ('delivered','failed')`
          : await tx`
select
  id
from
  storage_reservations
where
  facility_id = ${id}
  and status in ('confirmed', 'received')
`;
      assert(
        busy.length === 0,
        'ACTIVE_COMMITMENTS',
        'Complete active bookings before changing capacity or availability.',
      );
      assert(
        new Date(changes.available_until || before.available_until) >
          new Date(changes.available_from || before.available_from),
        'INVALID_WINDOW',
        'Availability end must follow its start.',
      );
    }
    assert(Object.keys(changes).length, 'NO_CHANGES', 'No updates provided.', 400);
    const [out] =
      await tx`update ${tx(tables[kind])} set ${tx(changes)} where id=${id} returning *`;
    await audit(tx, a, 'update', tables[kind], id, before.organization_id, before, out);
    return out;
  });
}
