create unique index one_late_pickup_incident on incidents (order_id, kind) where kind = 'late_pickup' and order_id is not null;
