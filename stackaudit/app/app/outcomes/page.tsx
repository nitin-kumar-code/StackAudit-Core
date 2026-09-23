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
        
        // Fetch all workloads first
        const wlRes = await fetch('/api/v1/workloads');
        if (!wlRes.ok) throw new Error('Failed to load workloads');
        const { workloads } = await wlRes.json();

        // Fetch CPO for each workload. The backend API handles the grouping by type correctly.
        const cpoPromises = workloads.map(async (w: any) => {
          const res = await fetch(`/api/v1/analytics/cost-per-outcome?workloadId=${w.id}&start=${start}&end=${end}`);
          if (res.ok) {
            const cpoData = await res.json();
            return cpoData.results.map((r: any) => ({ ...r, workloadName: w.name }));
          }
          return [];
        });

        const results = await Promise.all(cpoPromises);
        setData(results.flat());
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadOutcomes();
  }, []);

  if (loading) return <div className="p-8 text-gray-500">Loading outcomes...</div>;

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Business Outcomes</h1>
        <p className="text-gray-500 mt-1">
          Cost per outcome represents the total workload cost divided by the specific outcome type. 
          It does not partition cost among different outcome types (unallocated).
        </p>
      </div>

      {data.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center text-gray-500 bg-white">
          <h3 className="text-lg font-medium text-gray-900 mb-1">No outcome events recorded</h3>
          <p>Cost per outcome will appear once business outcomes are recorded.</p>
        </div>
      ) : (
        <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Workload</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Outcome Type</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Count</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cost / Outcome</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{row.workloadName}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                      {row.outcomeType}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-gray-900 font-medium">
                    {row.totalOutcomeCount.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right font-medium">
                    {row.costPerOutcome ? `$${parseFloat(row.costPerOutcome).toFixed(4)}` : '—'}
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
