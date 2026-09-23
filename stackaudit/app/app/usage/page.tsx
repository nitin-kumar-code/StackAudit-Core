'use client';
import { useEffect, useState } from 'react';
import { Database } from 'lucide-react';

export default function UsagePage() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUsage() {
      try {
        const start = new Date(Date.now() - 30 * 86400000).toISOString();
        const end = new Date().toISOString();
        const res = await fetch(`/api/v1/usage?start=${start}&end=${end}&limit=100`);
        if (res.ok) {
          const data = await res.json();
          setEvents(data.events || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadUsage();
  }, []);

  if (loading) return <div className="p-8 text-gray-500">Loading usage events...</div>;

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usage Exploration</h1>
        <p className="text-gray-500 mt-1">Raw attributed AI usage events from your providers.</p>
      </div>

      {events.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center text-gray-500 bg-white">
          <Database className="w-8 h-8 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">No usage data</h3>
          <p>No usage events found for the selected period.</p>
        </div>
      ) : (
        <div className="bg-white border rounded-lg shadow-sm overflow-hidden overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Provider</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Model</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">In/Out Tokens</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Cost</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {events.map((e, idx) => (
                <tr key={idx} className="hover:bg-gray-50 text-sm">
                  <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                    {new Date(e.timestamp).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900 capitalize">
                    {e.provider}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-500 font-mono text-xs">
                    {e.model}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-gray-500 font-mono">
                    {e.input_tokens || 0} / {e.output_tokens || 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right font-medium text-gray-900">
                    {e.is_unpriced ? (
                      <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded">Unpriced</span>
                    ) : (
                      `$${parseFloat(e.calculated_cost).toFixed(4)}`
                    )}
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
