import { z } from 'zod';
const id = z.uuid(),
  text = z.string().trim().min(1).max(2000),
  date = z.iso.datetime({ offset: true }),
  money = z.number().int().positive().max(1e12),
  kg = z.number().positive().max(1e8);
export const schemas = {
  farms: z
    .object({
      organization_id: id,
      name: text,
      address_description: text,
      region: text,
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
    })
    .strict(),
  harvests: z
    .object({
      organization_id: id,
      farm_id: id,
      crop_id: id,
      variety: text.optional(),
      grade: text,
      estimated_harvest_date: z.iso.date(),
      actual_harvest_date: z.iso.date().optional(),
      available_until: date,
      total_quantity: kg,
      unit_id: id,
      measured_kg: kg.optional(),
      price_minor: money,
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .default('NGN'),
      storage_adequacy: z.number().min(0).max(100).default(0),
      delay_hours: z.number().min(0).default(0),
      condition_risk: z.number().min(0).max(100).default(0),
    })
    .strict(),
  requirements: z
    .object({
      organization_id: id,
      crop_id: id,
      grade: text,
      quantity_kg: kg,
      max_price_minor: money,
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .default('NGN'),
      window_start: date,
      window_end: date,
      expires_at: date,
      destination: text,
      region: text,
    })
    .strict()
    .refine((v) => new Date(v.window_end) > new Date(v.window_start), 'End must follow start')
    .refine(
      (v) => new Date(v.expires_at) <= new Date(v.window_end),
      'Demand expiry must be within the collection window',
    ),
  offers: z
    .object({
      parent_offer_id: id.optional(),
      organization_id: id,
      lot_id: id,
      requirement_id: id,
      quantity_kg: kg,
      price_minor: money,
      expires_at: date,
    })
    .strict(),
  vehicles: z
    .object({
      organization_id: id,
      name: text,
      capacity_kg: kg,
      suitability: z.enum(['open', 'covered', 'insulated', 'refrigerated']),
      region: text,
      available_from: date,
      available_until: date,
    })
    .strict()
    .refine((v) => v.available_until > v.available_from, 'Invalid availability'),
  facilities: z
    .object({
      organization_id: id,
      name: text,
      capacity_kg: kg,
      crop_ids: z.array(id).min(1),
      conditions: text,
      price_minor: z.number().int().nonnegative(),
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .default('NGN'),
      region: text,
      available_from: date,
      available_until: date,
    })
    .strict()
    .refine((v) => v.available_until > v.available_from, 'Invalid availability'),
  reservations: z
    .object({
      organization_id: id,
      facility_id: id,
      lot_id: id,
      quantity_kg: kg,
      starts_at: date,
      ends_at: date,
    })
    .strict()
    .refine((v) => v.ends_at > v.starts_at, 'Invalid reservation window'),
  incidents: z
    .object({
      organization_id: id,
      order_id: id.optional(),
      kind: text,
      description: text,
      evidence: text.optional(),
    })
    .strict(),
  quotes: z
    .object({
      organization_id: id,
      order_id: id,
      vehicle_id: id.optional(),
      price_minor: money.optional(),
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .default('NGN'),
      pickup_at: date,
      delivery_at: date,
    })
    .strict()
    .refine((v) => v.delivery_at > v.pickup_at, 'Invalid transport window'),
  destinations: z
    .object({ organization_id: id, label: text, address: text, region: text })
    .strict(),
  saved_suppliers: z.object({ organization_id: id, supplier_id: id }).strict(),
  verification: z.object({ organization_id: id, evidence: text }).strict(),
  receipt: z
    .object({
      received_kg: z.number().nonnegative(),
      rejected_kg: z.number().nonnegative(),
      grade: text,
      evidence: text,
    })
    .strict(),
  payments: z
    .object({
      order_id: id,
      reference: text,
      amount_minor: money,
      currency: z.string().regex(/^[A-Z]{3}$/),
      evidence: text,
    })
    .strict(),
  loss: z.object({ quantity_kg: kg, evidence: text.optional(), declaration: text }).strict(),
};
export { id, text, date, money, kg };
