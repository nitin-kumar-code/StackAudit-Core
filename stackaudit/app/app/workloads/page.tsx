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

  if (loading) return <div className="p-8 text-muted-foreground">Loading workloads...</div>;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Workload Economics</h1>
        <button className="flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 text-sm font-medium">
          <Plus className="w-4 h-4 mr-2" />
          Create Workload
        </button>
      </div>

      {workloads.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center text-muted-foreground bg-card">
          <Activity className="w-8 h-8 mx-auto mb-4 text-gray-400" />
          <h3 className="text-lg font-medium text-foreground mb-1">No workloads configured yet</h3>
          <p>Create a workload and start attributing AI usage to it.</p>
        </div>
      ) : (
        <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Workload</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Description</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-gray-200">
              {workloads.map((w) => (
                <tr key={w.id} className="hover:bg-muted/50">
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-foreground">{w.name}</td>
                  <td className="px-6 py-4 text-muted-foreground">{w.description || '—'}</td>
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
