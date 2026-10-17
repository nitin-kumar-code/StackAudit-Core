'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Database, Filter, ChevronLeft, ChevronRight, Activity, Zap, DollarSign } from 'lucide-react';

function formatNumber(num: number) {
  if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return num.toString();
}

function formatCurrency(val: number) {
  return '$' + val.toFixed(2);
}

function UsageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // State
  const [events, setEvents] = useState<any[]>([]);
  const [summary, setSummary] = useState({ totalRequests: 0, totalTokens: 0, totalCost: 0, totalEvents: 0 });
  const [filterOptions, setFilterOptions] = useState({ providers: [], models: [], workloads: [] });
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);

  // Filters from URL
  const range = searchParams.get('range') || '90d';
  const provider = searchParams.get('provider') || 'all';
  const model = searchParams.get('model') || 'all';
  const workloadId = searchParams.get('workloadId') || 'all';
  const pageParam = parseInt(searchParams.get('page') || '1', 10);

  const updateFilters = (newParams: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newParams).forEach(([k, v]) => {
      if (v === 'all' || !v) params.delete(k);
      else params.set(k, v);
    });
    // Reset page on filter change
    if (!newParams.page) params.set('page', '1');
    router.push(`?${params.toString()}`);
  };

  useEffect(() => {
    async function loadUsage() {
      setLoading(true);
      try {
        let days = 90;
        if (range === '24h') days = 1;
        if (range === '7d') days = 7;
        if (range === '30d') days = 30;

        const start = new Date(Date.now() - days * 86400000).toISOString();
        const end = new Date().toISOString();

        const query = new URLSearchParams({
          start,
          end,
          limit: '50',
          page: pageParam.toString(),
        });
        
        if (provider !== 'all') query.set('provider', provider);
        if (model !== 'all') query.set('model', model);
        if (workloadId !== 'all') query.set('workloadId', workloadId);

        const res = await fetch(`/api/v1/usage?${query.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setEvents(data.events || []);
          setSummary(data.summary || { totalRequests: 0, totalTokens: 0, totalCost: 0, totalEvents: 0 });
          setFilterOptions(data.filters || { providers: [], models: [], workloads: [] });
          setPagination(data.pagination || { page: 1, limit: 50, total: 0, totalPages: 0 });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadUsage();
  }, [range, provider, model, workloadId, pageParam]);

  return (
    <div className="space-y-6 max-w-[1200px] w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-gray-900">Usage Explorer</h1>
          <p className="text-[15px] text-gray-500 mt-1">Raw AI workload requests and metrics across all providers.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <select 
            value={range}
            onChange={(e) => updateFilters({ range: e.target.value })}
            className="h-9 px-3 py-1 rounded-md border border-gray-200 bg-white text-sm font-medium text-gray-700 shadow-sm focus:border-gray-300 focus:ring-0 outline-none cursor-pointer"
          >
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>
          <select 
            value={workloadId}
            onChange={(e) => updateFilters({ workloadId: e.target.value })}
            className="h-9 px-3 py-1 rounded-md border border-gray-200 bg-white text-sm font-medium text-gray-700 shadow-sm focus:border-gray-300 focus:ring-0 outline-none cursor-pointer max-w-[200px] truncate"
          >
            <option value="all">All Workloads</option>
            {filterOptions.workloads.map((w: any) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <select 
            value={provider}
            onChange={(e) => updateFilters({ provider: e.target.value, model: 'all' })}
            className="h-9 px-3 py-1 rounded-md border border-gray-200 bg-white text-sm font-medium text-gray-700 shadow-sm focus:border-gray-300 focus:ring-0 outline-none cursor-pointer capitalize"
          >
            <option value="all">All Providers</option>
            {filterOptions.providers.map((p: string) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select 
            value={model}
            onChange={(e) => updateFilters({ model: e.target.value })}
            className="h-9 px-3 py-1 rounded-md border border-gray-200 bg-white text-sm font-medium text-gray-700 shadow-sm focus:border-gray-300 focus:ring-0 outline-none cursor-pointer"
          >
            <option value="all">All Models</option>
            {filterOptions.models.map((m: string) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col justify-center">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <Activity className="w-4 h-4" />
            <h3 className="text-sm font-medium">Total Requests</h3>
          </div>
          <div className="text-2xl font-semibold text-gray-900">
            {loading ? '-' : formatNumber(summary.totalRequests)}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col justify-center">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <Zap className="w-4 h-4" />
            <h3 className="text-sm font-medium">Total Tokens</h3>
          </div>
          <div className="text-2xl font-semibold text-gray-900">
            {loading ? '-' : formatNumber(summary.totalTokens)}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col justify-center">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <DollarSign className="w-4 h-4" />
            <h3 className="text-sm font-medium">Total Cost</h3>
          </div>
          <div className="text-2xl font-semibold text-gray-900">
            {loading ? '-' : formatCurrency(summary.totalCost)}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-sm text-gray-400 border border-gray-200 rounded-xl bg-white shadow-sm">
          Loading usage events...
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <Database className="w-8 h-8 mx-auto mb-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900 mb-1">No usage data</h3>
          <p className="text-sm text-gray-500">No usage events found for the selected filters.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-[#FAFAFA]">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Workload</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Model</th>
                  <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Requests</th>
                  <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Tokens (In / Out)</th>
                  <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Cost</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {events.map((e, idx) => {
                  const isAnomaly = e.request_count > 1000 && parseFloat(e.calculated_cost) > 5.0; 
                  return (
                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors group">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(e.timestamp).toLocaleString(undefined, {
                          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                        })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-gray-900">{e.workload_name || 'Unattributed'}</span>
                          <span className="text-xs text-gray-400 capitalize">{e.provider}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-mono text-gray-600 ring-1 ring-inset ring-gray-500/10">
                          {e.model}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-600 font-mono">
                        {formatNumber(e.request_count || 1)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500 font-mono">
                        {formatNumber(e.input_tokens || 0)} <span className="text-gray-300">/</span> {formatNumber(e.output_tokens || 0)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className={`text-sm font-mono ${isAnomaly ? 'text-rose-600 font-medium bg-rose-50 px-2 py-1 rounded-md' : 'text-gray-900'}`}>
                          {formatCurrency(parseFloat(e.calculated_cost || '0'))}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {/* Pagination Footer */}
          <div className="bg-[#FAFAFA] border-t border-gray-100 px-6 py-3 flex items-center justify-between">
            <span className="text-sm text-gray-500">
              Showing <span className="font-medium text-gray-900">{(pagination.page - 1) * pagination.limit + 1}</span> to <span className="font-medium text-gray-900">{Math.min(pagination.page * pagination.limit, pagination.total)}</span> of <span className="font-medium text-gray-900">{formatNumber(pagination.total)}</span> events
            </span>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => updateFilters({ page: (pagination.page - 1).toString() })}
                disabled={pagination.page <= 1}
                className="p-1 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed text-gray-600"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button 
                onClick={() => updateFilters({ page: (pagination.page + 1).toString() })}
                disabled={pagination.page >= pagination.totalPages}
                className="p-1 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed text-gray-600"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function UsagePage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400 text-sm">Loading Explorer...</div>}>
      <UsageContent />
    </Suspense>
  );
}
