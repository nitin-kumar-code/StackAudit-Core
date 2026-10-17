'use client';
import { useEffect, useState } from 'react';

export default function OutcomesPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadOutcomes() {
      try {
        const start = new Date(Date.now() - 90 * 86400000).toISOString();
        const end = new Date().toISOString();
        
        const res = await fetch(`/api/v1/outcomes?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
        if (!res.ok) throw new Error('Failed to load outcomes');
        setData((await res.json()).data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadOutcomes();
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

      {data.length === 0 ? (
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
