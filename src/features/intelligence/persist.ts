import { assessRisk } from './engine';
export async function persistRisk(tx: any, id: string) {
  const [h] = await tx`
select
  h.*,
  c.handling_hours
from
  harvests h
  join crops c on c.id = h.crop_id
where
  h.id = ${id}
`;
  const [mass] = await tx`
select
  coalesce(sum(total_kg), 0) as total,
  coalesce(sum(total_kg - reserved_kg - sold_kg - lost_kg), 0) as available
from
  harvest_lots
where
  harvest_id = ${id}
`;
  const [config] = await tx`select * from algorithm_configurations where active=true`;
  if (!config || !h || Number(mass.total) <= 0) return null;
  const risk = assessRisk(
    {
      eligibleKg: Number(mass.total),
      availableKg: Number(mass.available),
      harvestAt: h.actual_harvest_date || h.estimated_harvest_date,
      handlingHours: h.handling_hours,
      storageAdequacy: Number(h.storage_adequacy),
      delayHours: Number(h.delay_hours),
      conditionRisk: Number(h.condition_risk),
    },
    new Date(),
    config.weights,
    config.thresholds,
  );
  const [result] = await tx`
insert into
  risk_assessments (harvest_id, model_version, score, level, factors, assumptions)
values
  (${id}, ${config.version}, ${risk.score}, ${risk.level}, ${tx.json(risk.factors)}, ${tx.json([...risk.assumptions, config.assumptions])})
returning
  *
`;
  return result;
}
