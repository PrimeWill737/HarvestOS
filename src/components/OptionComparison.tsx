'use client';
import { useState } from 'react';
import { compareOptions } from '@/features/intelligence/engine';
export default function OptionComparison() {
  const [rows, setRows] = useState<ReturnType<typeof compareOptions>>([]);
  const names = [
    'Immediate local sale',
    'Higher-price distant sale',
    'Validated temporary storage',
    'Joint transport',
    'Alternative processing',
  ];
  return (
    <section className="panel">
      <h2>Compare fulfillment options</h2>
      <p>
        Enter documented estimates in kobo. Blank costs remain unknown. Feasibility must be checked
        before comparing returns.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setRows(
            compareOptions(
              names.map((name, i) => {
                const cost = (key: string) =>
                  f.get(i + '-' + key) === '' ? null : Number(f.get(i + '-' + key));
                return {
                  name,
                  revenueMinor: Number(f.get(i + '-revenue')),
                  transportMinor: cost('transport'),
                  storageMinor: cost('storage'),
                  feesMinor: cost('fees'),
                  feasible: f.get(i + '-feasible') === 'on',
                  risks: [String(f.get(i + '-risks') || 'No documented risk review')],
                };
              }),
            ),
          );
        }}
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Option</th>
                <th>Revenue</th>
                <th>Transport</th>
                <th>Storage</th>
                <th>Fees</th>
                <th>Feasible</th>
                <th>Constraints / risks</th>
              </tr>
            </thead>
            <tbody>
              {names.map((name, i) => (
                <tr key={name}>
                  <td>{name}</td>
                  {['revenue', 'transport', 'storage', 'fees'].map((k) => (
                    <td key={k}>
                      <input
                        aria-label={name + ' ' + k}
                        style={{ minWidth: 90 }}
                        name={i + '-' + k}
                        type="number"
                        min="0"
                        step="1"
                        required={k === 'revenue'}
                      />
                    </td>
                  ))}
                  <td>
                    <input aria-label={name + ' feasible'} name={i + '-feasible'} type="checkbox" />
                  </td>
                  <td>
                    <input
                      aria-label={name + ' risks'}
                      name={i + '-risks'}
                      style={{ minWidth: 150 }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="button" type="submit">
          Compare expected net returns
        </button>
      </form>
      {rows.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Option</th>
                <th>Feasibility</th>
                <th>Expected net return (kobo)</th>
                <th>Risks</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td>{r.feasible ? 'Reviewed as feasible' : 'Not feasible'}</td>
                  <td>
                    {r.netMinor === null
                      ? 'Unknown — incomplete costs'
                      : r.netMinor.toLocaleString()}
                  </td>
                  <td>{r.risks.join('; ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
