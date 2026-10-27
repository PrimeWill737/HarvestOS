import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
let database: PGlite;
let adapter: any;
vi.mock('../../src/lib/db', () => ({ db: () => adapter, configured: () => true }));
vi.mock('../../src/lib/supabase/server', () => ({ supabase: vi.fn() }));
import { createResource, publishHarvest, evaluateRisk } from '../../src/features/resources';
import {
  placeOffer,
  acceptOffer,
  cancelOrder,
  confirmReceipt,
  verifyReceipt,
  recordLoss,
} from '../../src/features/commerce';
import { storageAction } from '../../src/features/fulfillment';
import type { Actor } from '../../src/lib/auth';
function client(pg: any): any {
  const tag: any = async (strings: any, ...values: any[]) => {
    let query = '';
    const params: any[] = [];
    strings.forEach((part: string, i: number) => {
      query += part;
      if (i < values.length) {
        const value = values[i];
        if (value?.__record) {
          const entries = Object.entries(value.__record);
          const bind = (v: any) => {
            params.push(v);
            return '$' + params.length;
          };
          if (/insert into[^;]+$/i.test(query))
            query +=
              '(' +
              entries.map(([k]) => '"' + k + '"').join(',') +
              ') values(' +
              entries.map(([, v]) => bind(v)).join(',') +
              ')';
          else query += entries.map(([k, v]) => '"' + k + '"=' + bind(v)).join(',');
        } else if (value?.__identifier) query += '"' + value.__identifier + '"';
        else {
          params.push(value?.__json !== undefined ? JSON.stringify(value.__json) : value);
          query += '$' + params.length;
        }
      }
    });
    return (await pg.query(query, params)).rows;
  };
  const callable: any = (first: any, ...rest: any[]) =>
    Array.isArray(first) && 'raw' in first
      ? tag(first, ...rest)
      : typeof first === 'string'
        ? { __identifier: first }
        : { __record: first };
  callable.json = (v: any) => ({ __json: v });
  callable.begin = (fn: any) => database.transaction((tx: any) => fn(client(tx)));
  return callable;
}

const u = (n: number) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const farmer: Actor = {
    id: u(1),
    email: 'farmer@example.test',
    role: 'member',
    region: null,
    aal: 'aal1',
  },
  buyer: Actor = { ...farmer, id: u(2), email: 'buyer@example.test' },
  staff: Actor = {
    ...farmer,
    id: u(3),
    email: 'staff@example.test',
    role: 'coordinator',
    region: 'Plateau',
  },
  provider: Actor = { ...farmer, id: u(4) };
beforeAll(async () => {
  database = new PGlite();
  adapter = client(database);
  await database.exec(
    `
create schema auth;

create role anon;

create role authenticated;

create table auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb default '{}'
);

create function auth.uid () returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
`,
  );
  for (const name of readdirSync('supabase/migrations')
    .filter((x) => x.endsWith('.sql'))
    .sort()) {
    let sql = readFileSync('supabase/migrations/' + name, 'utf8');
    sql = sql
      .replace('create extension if not exists pgcrypto;', '')
      .replace('create extension if not exists postgis with schema extensions;', '')
      .replace('location extensions.geography (Point, 4326)', 'location text')
      .replace('create index farms_location_gix on farms using gist (location);', '');
    await database.exec(sql);
  }
  await database.exec(readFileSync('supabase/seed.sql', 'utf8'));
  await database.exec(`
insert into
  auth.users (id, email, email_confirmed_at)
values
  ('${u(1)}', 'farmer@example.test', now()),
  ('${u(2)}', 'buyer@example.test', now()),
  ('${u(3)}', 'staff@example.test', now()),
  ('${u(4)}', 'provider@example.test', now());

insert into
  organizations (id, name, type, verification_status)
values
  ('${u(10)}', 'Farm', 'farmer', 'verified'),
  ('${u(11)}', 'Buyer', 'buyer', 'verified'),
  ('${u(12)}', 'Storage', 'storage_provider', 'verified');

insert into
  organization_memberships (organization_id, user_id, role)
values
  ('${u(10)}', '${u(1)}', 'owner'),
  ('${u(11)}', '${u(2)}', 'owner'),
  ('${u(12)}', '${u(4)}', 'owner');

insert into
  farms (id, organization_id, name, address_description)
values
  ('${u(20)}', '${u(10)}', 'Test farm', 'Plateau');

insert into
  harvests (
    id,
    organization_id,
    farm_id,
    crop_id,
    grade,
    estimated_harvest_date,
    available_until,
    total_quantity,
    unit_id,
    price_minor,
    status
  )
values
  (
    '${u(30)}',
    '${u(10)}',
    '${u(20)}',
    (
      select
        id
      from
        crops
      where
        name = 'Tomatoes'
    ),
    'A',
    current_date,
    now() + interval '7 days',
    100,
    (
      select
        id
      from
        units
      where
        code = 'kg'
    ),
    50000,
    'published'
  );

insert into
  harvest_lots (id, harvest_id, label, total_kg)
values
  ('${u(40)}', '${u(30)}', 'Lot', 100);

insert into
  buyer_requirements (
    id,
    organization_id,
    crop_id,
    grade,
    quantity_kg,
    max_price_minor,
    window_start,
    window_end,
    expires_at,
    destination
  )
values
  (
    '${u(50)}',
    '${u(11)}',
    (
      select
        id
      from
        crops
      where
        name = 'Tomatoes'
    ),
    'A',
    200,
    60000,
    now(),
    now() + interval '7 days',
    now() + interval '6 days',
    'Jos'
  );

insert into
  purchase_offers (
    id,
    organization_id,
    lot_id,
    requirement_id,
    quantity_kg,
    price_minor,
    expires_at,
    idempotency_key,
    created_by
  )
values
  (
    '${u(60)}',
    '${u(11)}',
    '${u(40)}',
    '${u(50)}',
    30,
    50000,
    now() + interval '1 day',
    'first-offer',
    '${u(2)}'
  ),
  (
    '${u(61)}',
    '${u(11)}',
    '${u(40)}',
    '${u(50)}',
    40,
    50000,
    now() + interval '1 day',
    'second-offer',
    '${u(2)}'
  ),
  (
    '${u(62)}',
    '${u(11)}',
    '${u(40)}',
    '${u(50)}',
    40,
    50000,
    now() + interval '1 day',
    'third-offer',
    '${u(2)}'
  );

insert into
  storage_facilities (
    id,
    organization_id,
    name,
    capacity_kg,
    crop_ids,
    conditions,
    price_minor,
    region,
    available_from,
    available_until
  )
values
  (
    '${u(70)}',
    '${u(12)}',
    'Cold room',
    50,
    array[
      (
        select
          id
        from
          crops
        where
          name = 'Tomatoes'
      )
    ],
    'Cool',
    100,
    'Plateau',
    now() - interval '1 day',
    now() + interval '10 days'
  );

insert into
  storage_reservations (id, organization_id, facility_id, lot_id, quantity_kg, starts_at, ends_at)
values
  (
    '${u(80)}',
    '${u(10)}',
    '${u(70)}',
    '${u(40)}',
    30,
    now() + interval '1 hour',
    now() + interval '2 days'
  ),
  (
    '${u(81)}',
    '${u(10)}',
    '${u(70)}',
    '${u(40)}',
    30,
    now() + interval '1 hour',
    now() + interval '2 days'
  );
`);
});
afterAll(async () => {
  await database?.close();
});
describe.sequential(
  'real PostgreSQL engine business transactions (PostGIS substituted only for test runtime)',
  () => {
    it('denies buyer acceptance of a farmer-owned offer', async () => {
      await expect(acceptOffer(buyer, u(60))).rejects.toMatchObject({ status: 403 });
    });
    it('reserves atomically and retries create only one order', async () => {
      const first: any = await acceptOffer(farmer, u(60));
      const retry: any = await acceptOffer(farmer, u(60));
      expect(first.id).toBe(retry.id);
      const rows = await adapter`select * from harvest_lots where id=${u(40)}`;
      expect(Number(rows[0].reserved_kg)).toBe(30);
    });
    it('competing final allocations cannot oversell', async () => {
      const results = await Promise.allSettled([
        acceptOffer(farmer, u(61)),
        acceptOffer(farmer, u(62)),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      const [lot] = await adapter`select * from harvest_lots where id=${u(40)}`;
      expect(Number(lot.reserved_kg)).toBe(70);
    });
    it('cancellation returns exactly the committed quantity once', async () => {
      const [order] = await adapter`select * from orders where offer_id<>${u(60)}`;
      await cancelOrder(farmer, order.id, 'Buyer cancelled before dispatch');
      await cancelOrder(farmer, order.id, 'Retry cancellation');
      const [lot] = await adapter`select * from harvest_lots where id=${u(40)}`;
      expect(Number(lot.reserved_kg)).toBe(30);
    });
    it('buyer receipt alone does not inflate verified impact', async () => {
      const [order] = await adapter`select * from orders where offer_id=${u(60)}`;
      await confirmReceipt(buyer, order.id, {
        received_kg: 30,
        rejected_kg: 0,
        grade: 'A',
        evidence: 'Signed receipt evidence',
      });
      const [n] = await adapter`select count(*) from impact_measurements`;
      expect(Number(n.count)).toBe(0);
    });
    it('a receipt recorder cannot verify their own receipt after becoming staff', async () => {
      const [order] = await adapter`select * from orders where offer_id=${u(60)}`;
      await expect(
        verifyReceipt({ ...buyer, role: 'coordinator', region: 'Plateau' }, order.id, {}),
      ).rejects.toMatchObject({ code: 'INDEPENDENT_REVIEW_REQUIRED' });
    });
    it('independent review moves reserved mass to sold and records one impact event', async () => {
      const [order] = await adapter`select * from orders where offer_id=${u(60)}`;
      await verifyReceipt(staff, order.id, {
        transport_minor: 10000,
        storage_minor: 0,
        fees_minor: 0,
      });
      await verifyReceipt(staff, order.id, {});
      const [lot] = await adapter`select * from harvest_lots where id=${u(40)}`;
      expect(Number(lot.sold_kg)).toBe(30);
      expect(Number(lot.reserved_kg)).toBe(0);
      const [n] = await adapter`select count(*) from impact_measurements`;
      expect(Number(n.count)).toBe(1);
    });
    it('overlapping storage bookings cannot exceed facility capacity', async () => {
      await storageAction(provider, u(80), 'confirm', {});
      await expect(storageAction(provider, u(81), 'confirm', {})).rejects.toMatchObject({
        code: 'CAPACITY_EXCEEDED',
      });
    });
    it('does not permit loss larger than unallocated stock', async () => {
      await expect(
        recordLoss(farmer, u(40), { quantity_kg: 80, declaration: 'Reported damage' }),
      ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    });
    it('database check constraint rejects negative or excess stock', async () => {
      await expect(
        database.exec(`update harvest_lots set reserved_kg=100 where id='${u(40)}'`),
      ).rejects.toThrow();
    });
    it('audit rows cannot be overwritten', async () => {
      await expect(database.exec("update audit_logs set action='tampered'")).rejects.toThrow(
        'History is append-only',
      );
    });
    it('runs the full authorized farm-to-sale journey through application services', async () => {
      const crop = (await adapter`select id from crops where name='Tomatoes'`)[0].id,
        unit = (await adapter`select id from units where code='kg'`)[0].id;
      const farm: any = await createResource(farmer, 'farms', {
        organization_id: u(10),
        name: 'Second farm',
        address_description: 'Jos cluster',
        region: 'Plateau',
      });
      const date = new Date().toISOString().slice(0, 10),
        future = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
      const harvest: any = await createResource(farmer, 'harvests', {
        organization_id: u(10),
        farm_id: farm.id,
        crop_id: crop,
        grade: 'A',
        estimated_harvest_date: date,
        available_until: future(5),
        total_quantity: 75,
        unit_id: unit,
        price_minor: 50000,
      });
      await publishHarvest(farmer, harvest.id);
      const risk: any = await evaluateRisk(farmer, harvest.id);
      expect(risk.model_version).toBe('rules-v1');
      const requirement: any = await createResource(buyer, 'requirements', {
        organization_id: u(11),
        crop_id: crop,
        grade: 'A',
        quantity_kg: 50,
        max_price_minor: 60000,
        window_start: future(1),
        window_end: future(4),
        expires_at: future(3),
        destination: 'Jos',
        region: 'Plateau',
      });
      const [lot] = await adapter`select id from harvest_lots where harvest_id=${harvest.id}`;
      const offer: any = await placeOffer(
        buyer,
        {
          organization_id: u(11),
          lot_id: lot.id,
          requirement_id: requirement.id,
          quantity_kg: 50,
          price_minor: 50000,
          expires_at: future(2),
        },
        'full-journey-offer',
      );
      const order: any = await acceptOffer(farmer, offer.id);
      await confirmReceipt(buyer, order.id, {
        received_kg: 50,
        rejected_kg: 0,
        grade: 'A',
        evidence: 'Signed collection receipt',
      });
      await verifyReceipt(staff, order.id, { transport_minor: 0, storage_minor: 0, fees_minor: 0 });
      const [stock] = await adapter`select * from harvest_lots where id=${lot.id}`;
      expect(Number(stock.total_kg) - Number(stock.sold_kg) - Number(stock.reserved_kg)).toBe(25);
      expect(Number(stock.sold_kg)).toBe(50);
    });
    it('direct authenticated browser access cannot read another tenant farm', async () => {
      await database.exec(
        `
grant usage on schema public,
auth to authenticated;

set role authenticated;

select
  set_config('request.jwt.claim.sub', '${buyer.id}', false);
`,
      );
      try {
        const rows = await database.query('select * from farms');
        expect(rows.rows).toHaveLength(0);
        await expect(database.exec(`update farms set name='tampered'`)).rejects.toThrow();
      } finally {
        await database.exec('reset role');
      }
    });
  },
);
