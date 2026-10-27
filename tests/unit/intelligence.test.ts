import { describe, it, expect } from 'vitest';
import {
  assessRisk,
  matchDemand,
  compareOptions,
  type Supply,
  type Candidate,
} from '../../src/features/intelligence/engine';
const now = new Date('2026-10-19T12:00:00Z');
const supply: Supply = {
  cropId: 'tomato',
  grade: 'A',
  availableKg: 100,
  readyAt: '2026-10-19T00:00:00Z',
  availableUntil: '2026-10-22T00:00:00Z',
  region: 'Plateau',
  currency: 'NGN',
  targetPriceMinor: 50000,
};
const demand: Candidate = {
  id: 'buyer',
  cropId: 'tomato',
  grade: 'A',
  verified: true,
  standing: true,
  expiresAt: '2026-10-21T00:00:00Z',
  windowStart: '2026-10-19T00:00:00Z',
  windowEnd: '2026-10-21T00:00:00Z',
  region: 'Plateau',
  currency: 'NGN',
  quantityKg: 40,
  priceMinor: 60000,
  transportMinor: null,
  storageMinor: null,
  feesMinor: null,
  reliability: null,
};
describe('transparent intelligence', () => {
  it('normalizes severity and uses the documented weights', () => {
    const r = assessRisk(
      {
        eligibleKg: 100,
        availableKg: 100,
        harvestAt: '2026-10-16T12:00:00Z',
        handlingHours: 72,
        storageAdequacy: 0,
        delayHours: 72,
        conditionRisk: 100,
      },
      now,
    );
    expect(r.score).toBe(100);
    expect(r.level).toBe('critical');
  });
  it('refreshes risk as stock and conditions change', () => {
    const input = {
      eligibleKg: 100,
      availableKg: 100,
      harvestAt: '2026-10-20T12:00:00Z',
      handlingHours: 72,
      storageAdequacy: 0,
      delayHours: 0,
      conditionRisk: 0,
    };
    expect(assessRisk({ ...input, availableKg: 20, storageAdequacy: 100 }, now).score).toBeLessThan(
      assessRisk(input, now).score,
    );
  });
  it.each([
    { cropId: 'pepper' },
    { grade: 'B' },
    { verified: false },
    { standing: false },
    { expiresAt: '2026-10-18T00:00:00Z' },
    { region: 'Lagos' },
    { currency: 'USD' },
    { windowStart: '2026-10-25T00:00:00Z', windowEnd: '2026-10-26T00:00:00Z' },
  ])('excludes hard constraint failure %j', (change) => {
    expect(matchDemand(supply, [{ ...demand, ...change }], now)).toEqual([]);
  });
  it('retains unknown reliability and costs without inventing estimates', () => {
    const [m] = matchDemand(supply, [demand], now);
    expect(m.reliability).toBeNull();
    expect(m.netMinor).toBeNull();
    expect(m.coverage).toBe(40);
    expect(m.quantityKg).toBe(40);
    expect(m.missing).toHaveLength(2);
  });
  it('supports partial demand and calculates minor-unit proceeds', () => {
    const [m] = matchDemand(
      { ...supply, availableKg: 30 },
      [{ ...demand, transportMinor: 20000, storageMinor: 0, feesMinor: 5000, reliability: 90 }],
      now,
    );
    expect(m.quantityKg).toBe(30);
    expect(m.netMinor).toBe(1775000);
  });
  it('prioritizes feasibility and keeps unknown costs null', () => {
    const options = compareOptions([
      {
        name: 'distant',
        revenueMinor: 90000,
        transportMinor: 0,
        storageMinor: 0,
        feesMinor: 0,
        feasible: false,
        risks: ['Late delivery'],
      },
      {
        name: 'local',
        revenueMinor: 50000,
        transportMinor: null,
        storageMinor: 0,
        feesMinor: 0,
        feasible: true,
        risks: [],
      },
    ]);
    expect(options[0].name).toBe('local');
    expect(options[0].netMinor).toBeNull();
  });
});
