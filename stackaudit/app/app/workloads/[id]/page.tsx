'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function WorkloadDetailPage() {
  const pathname = usePathname();
  const id = pathname?.split('/').pop();
  
  const [workload, setWorkload] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!id) return;
      try {
        const res = await fetch(`/api/v1/workloads/${id}`);
        if (res.ok) {
          const data = await res.json();
          setWorkload(data.workload);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id]);

  if (loading) return <div className="p-8 text-gray-500">Loading workload details...</div>;

  return (
    <div className="space-y-6 max-w-6xl">
      <Link href="/app/workloads" className="text-blue-600 hover:underline flex items-center text-sm font-medium">
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back to Workloads
      </Link>
      
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{workload?.name || 'Unknown Workload'}</h1>
        <p className="text-gray-500 mt-1">{workload?.description || 'No description provided.'}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border rounded-lg bg-white p-6 shadow-sm">
          <h2 className="font-medium mb-4">Configuration</h2>
          <div className="text-sm text-gray-600 space-y-2">
            <div><span className="font-medium text-gray-900">ID:</span> {workload?.id}</div>
            <div><span className="font-medium text-gray-900">Created:</span> {workload?.created_at ? new Date(workload.created_at).toLocaleDateString() : '—'}</div>
          </div>
        </div>

        <div className="border rounded-lg bg-white p-6 shadow-sm">
          <h2 className="font-medium mb-4">Attribution Rules</h2>
          <p className="text-sm text-gray-500">View and manage attribution rules via the API (V0).</p>
        </div>
      </div>
    </div>
  );
}
