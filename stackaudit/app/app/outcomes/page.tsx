'use client';
import { useEffect, useState } from 'react';
import { CostPerOutcomeResult } from '../../../core/types';

type OutcomeSummary = CostPerOutcomeResult & { workloadName: string };

export default function OutcomesPage() {
  const [data, setData] = useState<OutcomeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadOutcomes() {
    setLoading(true);
    setError(null);
    try {
      const start = new Date(Date.now() - 90 * 86400000).toISOString();
      const end = new Date().toISOString();
      
      const res = await fetch(`/api/v1/outcomes?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const b = await res.json(); if (b.error) msg = b.error; } catch {}
        throw new Error(msg);
      }
      setData((await res.json()).data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load outcomes');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOutcomes();
  }, []);

  if (loading) return <div className="p-8 text-muted-foreground">Loading outcomes...</div>;

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Business Outcomes</h1>
        <p className="text-muted-foreground mt-1">
          Cost per outcome uses the selected workload’s known costs and the selected outcome type count. Costs are unallocated across outcome types.
        </p>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>Failed to load outcomes: {error}</span>
          <button className="rounded-md border border-red-300 px-3 py-1.5 font-medium hover:bg-red-100" onClick={() => void loadOutcomes()}>Retry</button>
        </div>
      )}

      {!error && data.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center text-muted-foreground bg-card">
          <h3 className="text-lg font-medium text-foreground mb-1">No outcome events recorded</h3>
          <p>Cost per outcome will appear once business outcomes are recorded.</p>
        </div>
      ) : (
        <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Workload</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Outcome Type</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Count</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Cost / Outcome</th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-gray-200">
              {data.map((row, i) => (
                <tr key={i} className="hover:bg-muted/50">
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-foreground">{row.workloadName}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                      {row.outcomeType}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-foreground font-medium">
                    {row.totalOutcomeCount.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right font-medium">
                    {row.costPerOutcome !== null ? `$${parseFloat(row.costPerOutcome).toFixed(4)}` : row.availabilityReason || 'Unavailable'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
