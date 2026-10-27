alter table incidents add column storage_reservation_id uuid references storage_reservations;

create unique index one_late_storage_incident on incidents (storage_reservation_id, kind) where kind = 'late_storage_collection' and storage_reservation_id is not null;
