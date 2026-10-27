insert into
  crops (name, handling_hours)
values
  ('Tomatoes', 72),
  ('Irish potatoes', 336),
  ('Cabbage', 168),
  ('Pepper', 120)
on conflict do nothing;

insert into
  units (code, label, measurement_type, kg_factor)
values
  ('kg', 'Kilograms', 'mass', 1),
  ('tonne', 'Metric tonnes', 'mass', 1000),
  ('basket', 'Basket (weigh before allocating)', 'count', null)
on conflict do nothing;

insert into
  algorithm_configurations (version, weights, thresholds, assumptions, active)
values
  (
    'rules-v1',
    '{"uncommitted":0.30,"urgency":0.25,"storage":0.20,"delay":0.15,"condition":0.10}',
    '{"moderate":35,"high":65,"critical":80}',
    'Prototype handling windows and weights; not calibrated spoilage probabilities.',
    true
  )
on conflict do nothing;
