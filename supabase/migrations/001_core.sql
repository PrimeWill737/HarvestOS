create schema if not exists extensions;

create extension if not exists pgcrypto;

create extension if not exists postgis with schema extensions;

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  phone text,
  locale text not null default 'en-NG',
  platform_role text not null default 'member' check (platform_role in ('member', 'coordinator', 'admin', 'super_admin')),
  region text,
  status text not null default 'active' check (status in ('active', 'suspended', 'deactivated')),
  created_at timestamptz not null default now()
);

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('farmer', 'buyer', 'cooperative', 'transporter', 'storage_provider')),
  region text not null default 'Plateau',
  verification_status text not null default 'pending' check (verification_status in ('pending', 'verified', 'rejected', 'suspended')),
  created_at timestamptz not null default now()
);

create table organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations,
  user_id uuid not null references profiles,
  role text not null check (role in ('owner', 'manager', 'member', 'agent')),
  status text not null default 'active' check (status in ('invited', 'active', 'suspended')),
  unique (organization_id, user_id)
);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations,
  email text not null,
  role text not null check (role in ('manager', 'member', 'agent')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz not null default now()
);

create table verification_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations,
  evidence text not null,
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  reviewer_id uuid references profiles,
  reason text,
  created_at timestamptz not null default now()
);

create table crops (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null default 'vegetable',
  handling_hours integer not null check (handling_hours > 0)
);

create table crop_varieties (
  id uuid primary key default gen_random_uuid(),
  crop_id uuid not null references crops,
  name text not null,
  unique (crop_id, name)
);

create table units (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  measurement_type text not null check (measurement_type in ('mass', 'count', 'volume')),
  kg_factor numeric check (kg_factor > 0)
);

create table farms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations,
  name text not null,
  location extensions.geography (Point, 4326),
  address_description text not null,
  region text not null default 'Plateau',
  created_at timestamptz not null default now()
);

create index farms_location_gix on farms using gist (location);

create table farm_delegations (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references farms,
  organization_id uuid not null references organizations,
  expires_at timestamptz not null,
  unique (farm_id, organization_id)
);

create table harvests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations,
  farm_id uuid not null references farms,
  crop_id uuid not null references crops,
  variety text,
  grade text not null,
  estimated_harvest_date date not null,
  actual_harvest_date date,
  available_until timestamptz not null,
  total_quantity numeric(14, 3) not null check (total_quantity > 0),
  unit_id uuid not null references units,
  measured_kg numeric(14, 3) check (measured_kg > 0),
  price_minor bigint not null check (price_minor >= 0),
  currency char(3) not null default 'NGN',
  status text not null default 'draft' check (
    status in ('draft', 'published', 'partially_allocated', 'allocated', 'completed', 'cancelled')
  ),
  storage_adequacy numeric not null default 0 check (storage_adequacy between 0 and 100),
  delay_hours numeric not null default 0 check (delay_hours >= 0),
  condition_risk numeric not null default 0 check (condition_risk between 0 and 100),
  photos jsonb not null default '[]',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index harvests_crop_date_idx on harvests (crop_id, estimated_harvest_date);

create index harvests_status_idx on harvests (status);

create table harvest_lots (
  id uuid primary key default gen_random_uuid(),
  harvest_id uuid not null references harvests,
  label text not null,
  total_kg numeric(14, 3) not null check (total_kg > 0),
  reserved_kg numeric(14, 3) not null default 0 check (reserved_kg >= 0),
  sold_kg numeric(14, 3) not null default 0 check (sold_kg >= 0),
  lost_kg numeric(14, 3) not null default 0 check (lost_kg >= 0),
  check (reserved_kg + sold_kg + lost_kg <= total_kg)
);

create table buyer_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations,
  crop_id uuid not null references crops,
  grade text not null,
  quantity_kg numeric(14, 3) not null check (quantity_kg > 0),
  allocated_kg numeric(14, 3) not null default 0 check (allocated_kg >= 0),
  max_price_minor bigint not null check (max_price_minor > 0),
  currency char(3) not null default 'NGN',
  window_start timestamptz not null,
  window_end timestamptz not null,
  expires_at timestamptz not null,
  destination text not null,
  region text not null default 'Plateau',
  status text not null default 'open' check (status in ('open', 'closed')),
  check (window_end > window_start),
  check (allocated_kg <= quantity_kg),
  created_at timestamptz not null default now()
);

create table purchase_offers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations,
  lot_id uuid not null references harvest_lots,
  requirement_id uuid not null references buyer_requirements,
  quantity_kg numeric(14, 3) not null check (quantity_kg > 0),
  price_minor bigint not null check (price_minor > 0),
  currency char(3) not null default 'NGN',
  expires_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'countered', 'expired')),
  parent_offer_id uuid references purchase_offers,
  idempotency_key text not null,
  created_by uuid not null references profiles,
  created_at timestamptz not null default now(),
  unique (created_by, idempotency_key)
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null unique references purchase_offers,
  seller_organization_id uuid not null references organizations,
  buyer_organization_id uuid not null references organizations,
  status text not null default 'confirmed' check (
    status in (
      'confirmed',
      'dispatched',
      'collected',
      'in_transit',
      'delivered',
      'received',
      'cancelled',
      'disputed'
    )
  ),
  currency char(3) not null default 'NGN',
  total_minor bigint not null check (total_minor >= 0),
  received_kg numeric(14, 3),
  rejected_kg numeric(14, 3),
  receipt_grade text,
  receipt_evidence text,
  receipt_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders,
  lot_id uuid not null references harvest_lots,
  quantity_kg numeric(14, 3) not null check (quantity_kg > 0),
  price_minor bigint not null check (price_minor > 0),
  unique (order_id, lot_id)
);

create table inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references harvest_lots,
  order_id uuid not null unique references orders,
  quantity_kg numeric(14, 3) not null check (quantity_kg > 0),
  status text not null default 'active' check (status in ('active', 'released', 'fulfilled')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table inventory_movements (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references harvest_lots,
  order_id uuid references orders,
  kind text not null check (kind in ('received', 'sold', 'lost', 'returned', 'adjustment')),
  quantity_kg numeric(14, 3) not null check (quantity_kg > 0),
  verified boolean not null default false,
  evidence text,
  actor_id uuid not null references profiles,
  created_at timestamptz not null default now()
);

create table payment_records (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders,
  reference text not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null default 'NGN',
  status text not null default 'unverified' check (status in ('unverified', 'verified', 'rejected')),
  evidence text not null,
  verified_by uuid references profiles,
  created_at timestamptz not null default now()
);

create table transport_vehicles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations,
  name text not null,
  capacity_kg numeric(14, 3) not null check (capacity_kg > 0),
  suitability text not null check (suitability in ('open', 'covered', 'insulated', 'refrigerated')),
  region text not null,
  available_from timestamptz not null,
  available_until timestamptz not null,
  check (available_until > available_from),
  created_at timestamptz not null default now()
);

create table transport_quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations,
  order_id uuid not null references orders,
  vehicle_id uuid references transport_vehicles,
  price_minor bigint check (price_minor >= 0),
  currency char(3) not null default 'NGN',
  pickup_at timestamptz not null,
  delivery_at timestamptz not null,
  status text not null default 'requested' check (status in ('requested', 'quoted', 'accepted', 'rejected')),
  check (delivery_at > pickup_at),
  created_at timestamptz not null default now()
);

create table shipments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations,
  order_id uuid not null unique references orders,
  vehicle_id uuid not null references transport_vehicles,
  quote_id uuid not null unique references transport_quotes,
  status text not null default 'assigned' check (status in ('assigned', 'dispatched', 'collected', 'in_transit', 'delivered', 'failed')),
  pickup_at timestamptz not null,
  delivery_at timestamptz not null,
  actual_charge_minor bigint check (actual_charge_minor >= 0),
  evidence text,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table storage_facilities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations,
  name text not null,
  capacity_kg numeric(14, 3) not null check (capacity_kg > 0),
  crop_ids uuid[] not null,
  conditions text not null,
  price_minor bigint not null check (price_minor >= 0),
  currency char(3) not null default 'NGN',
  region text not null,
  available_from timestamptz not null,
  available_until timestamptz not null,
  check (available_until > available_from),
  created_at timestamptz not null default now()
);

create table storage_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations,
  facility_id uuid not null references storage_facilities,
  lot_id uuid not null references harvest_lots,
  quantity_kg numeric(14, 3) not null check (quantity_kg > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'requested' check (status in ('requested', 'confirmed', 'received', 'released', 'rejected', 'cancelled')),
  received_kg numeric(14, 3),
  released_kg numeric(14, 3),
  evidence text,
  check (ends_at > starts_at),
  created_at timestamptz not null default now()
);

create index storage_dates_idx on storage_reservations (facility_id, starts_at, ends_at);

create table incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations,
  order_id uuid references orders,
  kind text not null,
  description text not null,
  evidence text,
  owner_id uuid references profiles,
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved')),
  resolution text,
  created_at timestamptz not null default now()
);

create table algorithm_configurations (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  weights jsonb not null,
  thresholds jsonb not null,
  assumptions text not null,
  active boolean not null default false,
  created_by uuid references profiles,
  created_at timestamptz not null default now()
);

create unique index one_active_algorithm on algorithm_configurations (active) where active;

create table risk_assessments (
  id uuid primary key default gen_random_uuid(),
  harvest_id uuid not null references harvests,
  model_version text not null references algorithm_configurations (version),
  score numeric not null check (score between 0 and 100),
  level text not null,
  factors jsonb not null,
  assumptions jsonb not null,
  created_at timestamptz not null default now()
);

create table match_recommendations (
  id uuid primary key default gen_random_uuid(),
  harvest_id uuid not null references harvests,
  requirement_id uuid not null references buyer_requirements,
  score numeric not null,
  explanation jsonb not null,
  created_at timestamptz not null default now()
);

create table recommendation_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations,
  harvest_id uuid not null references harvests,
  action text not null,
  reason text not null,
  actor_id uuid not null references profiles,
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table notification_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations,
  event text not null,
  payload jsonb not null,
  attempts integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles,
  organization_id uuid references organizations,
  action text not null,
  resource text not null,
  resource_id uuid,
  before_data jsonb,
  after_data jsonb,
  request_id text,
  created_at timestamptz not null default now()
);

create index audit_resource_idx on audit_logs (resource, resource_id, created_at);

create table impact_measurements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations,
  order_id uuid unique references orders,
  sold_kg numeric(14, 3) not null default 0,
  lost_kg numeric(14, 3) not null default 0,
  revenue_minor bigint not null default 0,
  transport_minor bigint,
  storage_minor bigint,
  fees_minor bigint,
  baseline_kg numeric(14, 3),
  methodology text,
  verified_by uuid references profiles,
  created_at timestamptz not null default now()
);

create table saved_suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations,
  supplier_id uuid not null references organizations,
  unique (organization_id, supplier_id)
);

create table destinations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations,
  label text not null,
  address text not null,
  region text not null,
  created_at timestamptz not null default now()
);

create table aggregation_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations,
  name text not null,
  lot_ids uuid[] not null,
  created_at timestamptz not null default now()
);

create table privacy_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles,
  kind text not null check (kind in ('access', 'correction', 'deletion')),
  details text not null,
  status text not null default 'open' check (status in ('open', 'processing', 'completed')),
  created_at timestamptz not null default now()
);

create table api_rate_limits (key text primary key, window_start timestamptz not null, hits integer not null);

create function protect_history()
returns trigger
language plpgsql
as $$
begin
  raise exception 'History is append-only';
end
$$;

create trigger audit_immutable before update or delete on audit_logs for each row execute function protect_history ();

create trigger movements_immutable before update or delete on inventory_movements for each row execute function protect_history ();

create trigger risk_immutable before update or delete on risk_assessments for each row execute function protect_history ();

create function create_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', 'New member'))
  on conflict do nothing;
  return new;
end
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute function create_profile ();

-- Browser access is read-only and tenant-scoped. All writes use authenticated server services.
create function member_of(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from organization_memberships m
    join profiles p on p.id = m.user_id
    join organizations o on o.id = m.organization_id
    where m.organization_id = org
      and m.user_id = auth.uid()
      and m.status = 'active'
      and p.status = 'active'
      and o.verification_status <> 'suspended'
  )
$$;

revoke all on function member_of (uuid) from public;

grant execute on function member_of (uuid) to authenticated;

alter table profiles enable row level security;

revoke all on profiles from anon, authenticated;

alter table organizations enable row level security;

revoke all on organizations from anon, authenticated;

alter table organization_memberships enable row level security;

revoke all on organization_memberships from anon, authenticated;

alter table invitations enable row level security;

revoke all on invitations from anon, authenticated;

alter table verification_requests enable row level security;

revoke all on verification_requests from anon, authenticated;

alter table crops enable row level security;

revoke all on crops from anon, authenticated;

alter table crop_varieties enable row level security;

revoke all on crop_varieties from anon, authenticated;

alter table units enable row level security;

revoke all on units from anon, authenticated;

alter table farms enable row level security;

revoke all on farms from anon, authenticated;

alter table farm_delegations enable row level security;

revoke all on farm_delegations from anon, authenticated;

alter table harvests enable row level security;

revoke all on harvests from anon, authenticated;

alter table harvest_lots enable row level security;

revoke all on harvest_lots from anon, authenticated;

alter table buyer_requirements enable row level security;

revoke all on buyer_requirements from anon, authenticated;

alter table purchase_offers enable row level security;

revoke all on purchase_offers from anon, authenticated;

alter table orders enable row level security;

revoke all on orders from anon, authenticated;

alter table order_items enable row level security;

revoke all on order_items from anon, authenticated;

alter table inventory_reservations enable row level security;

revoke all on inventory_reservations from anon, authenticated;

alter table inventory_movements enable row level security;

revoke all on inventory_movements from anon, authenticated;

alter table payment_records enable row level security;

revoke all on payment_records from anon, authenticated;

alter table transport_vehicles enable row level security;

revoke all on transport_vehicles from anon, authenticated;

alter table transport_quotes enable row level security;

revoke all on transport_quotes from anon, authenticated;

alter table shipments enable row level security;

revoke all on shipments from anon, authenticated;

alter table storage_facilities enable row level security;

revoke all on storage_facilities from anon, authenticated;

alter table storage_reservations enable row level security;

revoke all on storage_reservations from anon, authenticated;

alter table incidents enable row level security;

revoke all on incidents from anon, authenticated;

alter table algorithm_configurations enable row level security;

revoke all on algorithm_configurations from anon, authenticated;

alter table risk_assessments enable row level security;

revoke all on risk_assessments from anon, authenticated;

alter table match_recommendations enable row level security;

revoke all on match_recommendations from anon, authenticated;

alter table recommendation_actions enable row level security;

revoke all on recommendation_actions from anon, authenticated;

alter table notifications enable row level security;

revoke all on notifications from anon, authenticated;

alter table notification_outbox enable row level security;

revoke all on notification_outbox from anon, authenticated;

alter table audit_logs enable row level security;

revoke all on audit_logs from anon, authenticated;

alter table impact_measurements enable row level security;

revoke all on impact_measurements from anon, authenticated;

alter table saved_suppliers enable row level security;

revoke all on saved_suppliers from anon, authenticated;

alter table destinations enable row level security;

revoke all on destinations from anon, authenticated;

alter table aggregation_batches enable row level security;

revoke all on aggregation_batches from anon, authenticated;

alter table privacy_requests enable row level security;

revoke all on privacy_requests from anon, authenticated;

alter table api_rate_limits enable row level security;

revoke all on api_rate_limits from anon, authenticated;

grant select on farms to authenticated;

create policy tenant_read on farms for select to authenticated using (member_of (organization_id));

grant select on harvests to authenticated;

create policy tenant_read on harvests for select to authenticated using (member_of (organization_id));

grant select on buyer_requirements to authenticated;

create policy tenant_read on buyer_requirements for select to authenticated using (member_of (organization_id));

grant select on transport_vehicles to authenticated;

create policy tenant_read on transport_vehicles for select to authenticated using (member_of (organization_id));

grant select on storage_facilities to authenticated;

create policy tenant_read on storage_facilities for select to authenticated using (member_of (organization_id));

grant select on incidents to authenticated;

create policy tenant_read on incidents for select to authenticated using (member_of (organization_id));

grant select on destinations to authenticated;

create policy tenant_read on destinations for select to authenticated using (member_of (organization_id));

grant select on saved_suppliers to authenticated;

create policy tenant_read on saved_suppliers for select to authenticated using (member_of (organization_id));

grant select on verification_requests to authenticated;

create policy tenant_read on verification_requests for select to authenticated using (member_of (organization_id));

grant select on crops to authenticated;

create policy catalog_read on crops for select to authenticated using (true);

grant select on crop_varieties to authenticated;

create policy catalog_read on crop_varieties for select to authenticated using (true);

grant select on units to authenticated;

create policy catalog_read on units for select to authenticated using (true);

grant select on profiles, organizations, organization_memberships to authenticated;

create policy own_profile on profiles for select to authenticated using (id = auth.uid ());

create policy own_organizations on organizations for select to authenticated using (member_of (id));

create policy own_membership on organization_memberships for select to authenticated using (user_id = auth.uid ());
