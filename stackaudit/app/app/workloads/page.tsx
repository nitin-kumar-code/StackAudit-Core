'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Activity, Plus } from 'lucide-react';

export default function WorkloadsPage() {
  const [workloads, setWorkloads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchWorkloads() {
      try {
        const res = await fetch('/api/v1/workloads');
        if (res.ok) {
          const data = await res.json();
          setWorkloads(data.workloads || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchWorkloads();
  }, []);

  if (loading) return <div className="p-8 text-gray-500">Loading workloads...</div>;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Workload Economics</h1>
        <button className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium">
          <Plus className="w-4 h-4 mr-2" />
          Create Workload
        </button>
      </div>

      {workloads.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center text-gray-500 bg-white">
          <Activity className="w-8 h-8 mx-auto mb-4 text-gray-400" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">No workloads configured yet</h3>
          <p>Create a workload and start attributing AI usage to it.</p>
        </div>
      ) : (
        <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Workload</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {workloads.map((w) => (
                <tr key={w.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{w.name}</td>
                  <td className="px-6 py-4 text-gray-500">{w.description || '—'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Active
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link href={`/app/workloads/${w.id}`} className="text-blue-600 hover:text-blue-900 flex items-center justify-end">
                      Inspect <ArrowRight className="w-4 h-4 ml-1" />
                    </Link>
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
