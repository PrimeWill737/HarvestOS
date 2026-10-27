export type RiskInput = {
  eligibleKg: number;
  availableKg: number;
  harvestAt: string;
  handlingHours: number;
  storageAdequacy: number;
  delayHours: number;
  conditionRisk: number;
};
export const defaultWeights = {
  uncommitted: 0.3,
  urgency: 0.25,
  storage: 0.2,
  delay: 0.15,
  condition: 0.1,
};
const clamp = (v: number) => Math.min(100, Math.max(0, v));
export function assessRisk(
  input: RiskInput,
  now = new Date(),
  weights = defaultWeights,
  thresholds = { moderate: 35, high: 65, critical: 80 },
) {
  if (
    input.eligibleKg <= 0 ||
    input.handlingHours <= 0 ||
    Object.values(input).some((x) => typeof x === 'number' && !Number.isFinite(x))
  )
    throw new Error('Invalid risk inputs');
  const elapsed = (now.getTime() - new Date(input.harvestAt).getTime()) / 3600000;
  const factors = {
    uncommitted: clamp((100 * input.availableKg) / input.eligibleKg),
    urgency: clamp(
      elapsed < 0
        ? 50 * (1 + elapsed / input.handlingHours)
        : 50 + (50 * elapsed) / input.handlingHours,
    ),
    storage: clamp(100 - input.storageAdequacy),
    delay: clamp((100 * input.delayHours) / input.handlingHours),
    condition: clamp(input.conditionRisk),
  };
  const score = Math.round(
    Object.entries(factors).reduce(
      (n, [key, v]) => n + v * weights[key as keyof typeof weights],
      0,
    ),
  );
  return {
    score,
    level:
      score >= thresholds.critical
        ? 'critical'
        : score >= thresholds.high
          ? 'high'
          : score >= thresholds.moderate
            ? 'moderate'
            : 'low',
    factors,
    assumptions: [
      'Prototype rule-based coordination urgency, not spoilage probability. Time severity is 50 at harvest and 100 after one handling window.',
      elapsed < 0
        ? 'Pre-harvest coordination indicator.'
        : 'Post-harvest timing is based on reported dates.',
    ],
  };
}
export type Candidate = {
  id: string;
  cropId: string;
  grade: string;
  verified: boolean;
  standing: boolean;
  expiresAt: string;
  windowStart: string;
  windowEnd: string;
  region: string;
  currency: string;
  quantityKg: number;
  priceMinor: number;
  transportMinor: number | null;
  storageMinor: number | null;
  feesMinor: number | null;
  reliability: number | null;
};
export type Supply = {
  cropId: string;
  grade: string;
  availableKg: number;
  readyAt: string;
  availableUntil: string;
  region: string;
  currency: string;
  targetPriceMinor: number;
};
export function matchDemand(s: Supply, candidates: Candidate[], now = new Date()) {
  return candidates
    .filter(
      (c) =>
        c.cropId === s.cropId &&
        c.grade === s.grade &&
        c.currency === s.currency &&
        c.verified &&
        c.standing &&
        new Date(c.expiresAt) > now &&
        c.quantityKg > 0 &&
        s.availableKg > 0 &&
        c.region === s.region &&
        new Date(c.windowEnd) >= new Date(s.readyAt) &&
        new Date(c.windowStart) <= new Date(s.availableUntil),
    )
    .map((c) => {
      const quantityKg = Math.min(c.quantityKg, s.availableKg),
        grossMinor = Math.round(quantityKg * c.priceMinor);
      const knownCosts =
        c.transportMinor !== null && c.storageMinor !== null && c.feesMinor !== null;
      const netMinor = knownCosts
        ? grossMinor - c.transportMinor! - c.storageMinor! - c.feesMinor!
        : null;
      const factors = {
        revenue:
          netMinor === null
            ? null
            : clamp((100 * netMinor) / Math.max(1, quantityKg * s.targetPriceMinor)),
        window: 100,
        quantity: clamp((100 * quantityKg) / c.quantityKg),
        logistics: c.transportMinor === null ? null : 100,
        reliability: c.reliability,
      };
      const weights = {
        revenue: 0.3,
        window: 0.25,
        quantity: 0.15,
        logistics: 0.15,
        reliability: 0.15,
      };
      let total = 0,
        denominator = 0;
      for (const key of Object.keys(weights) as (keyof typeof weights)[])
        if (factors[key] !== null) {
          total += factors[key]! * weights[key];
          denominator += weights[key];
        }
      return {
        ...c,
        quantityKg,
        grossMinor,
        netMinor,
        score: Math.round(total / denominator),
        coverage: Math.round(denominator * 100),
        factors,
        reasons: [
          'Crop and grade compatible',
          'Collection windows overlap',
          'Same service region',
          'Partial allocation supported',
        ],
        missing: [
          ...(!knownCosts
            ? ['One or more transport, storage or fee estimates are unavailable']
            : []),
          ...(c.reliability === null
            ? ['Buyer reliability unknown; insufficient verified history']
            : []),
        ],
      };
    })
    .sort((a, b) => b.score - a.score);
}
export function compareOptions(
  options: {
    name: string;
    revenueMinor: number;
    transportMinor: number | null;
    storageMinor: number | null;
    feesMinor: number | null;
    feasible: boolean;
    risks: string[];
  }[],
) {
  return options
    .map((o) => ({
      ...o,
      netMinor: [o.transportMinor, o.storageMinor, o.feesMinor].some((x) => x === null)
        ? null
        : o.revenueMinor - o.transportMinor! - o.storageMinor! - o.feesMinor!,
    }))
    .sort(
      (a, b) =>
        Number(b.feasible) - Number(a.feasible) ||
        (b.netMinor ?? -Infinity) - (a.netMinor ?? -Infinity),
    );
}
