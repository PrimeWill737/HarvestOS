create table media_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations,
  public_id text not null unique,
  format text not null check (format in ('jpg', 'jpeg', 'png', 'webp')),
  bytes integer not null check (bytes between 1 and 5242880),
  created_by uuid not null references profiles,
  created_at timestamptz not null default now()
);

alter table media_assets enable row level security;

revoke all on media_assets from anon, authenticated;

create table operational_policies (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  settings jsonb not null,
  reason text not null,
  created_by uuid not null references profiles,
  created_at timestamptz not null default now()
);

alter table operational_policies enable row level security;

revoke all on operational_policies from anon, authenticated;

create trigger policies_immutable before update or delete on operational_policies for each row execute function protect_history ();

create table harvest_outcomes (
  id uuid primary key default gen_random_uuid(),
  harvest_id uuid not null references harvests,
  organization_id uuid not null references organizations,
  reported_sold_kg numeric(14, 3) not null check (reported_sold_kg >= 0),
  reported_lost_kg numeric(14, 3) not null check (reported_lost_kg >= 0),
  reported_held_kg numeric(14, 3) not null check (reported_held_kg >= 0),
  evidence text not null,
  submitted_by uuid not null references profiles,
  created_at timestamptz not null default now()
);

alter table harvest_outcomes enable row level security;

revoke all on harvest_outcomes from anon, authenticated;

create index membership_user_idx on organization_memberships (user_id, status);

create index lots_harvest_idx on harvest_lots (harvest_id);

create index offers_lot_status_idx on purchase_offers (lot_id, status);

create index orders_seller_idx on orders (seller_organization_id, status);

create index orders_buyer_idx on orders (buyer_organization_id, status);

create index outbox_pending_idx on notification_outbox (next_attempt_at) where status = 'pending';

create index risk_latest_idx on risk_assessments (harvest_id, created_at desc);
