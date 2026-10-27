alter table payment_records add column recorded_by uuid references profiles;

alter table orders add column receipt_recorded_by uuid references profiles;

alter table incidents add column escalated_at timestamptz;
