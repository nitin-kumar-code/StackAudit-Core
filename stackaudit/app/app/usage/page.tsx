'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Database, ChevronLeft, ChevronRight, Activity, Zap, DollarSign } from 'lucide-react';
import Big from 'big.js';

interface UsageEventRow { id: string; timestamp: string; provider: string; model: string; input_tokens: number | null; output_tokens: number | null; request_count: number | null; calculated_cost: string | null; workload_name?: string | null; is_unpriced?: boolean }
interface WorkloadOption { id: string; name: string }
interface UsageSummary { totalRequests: number; totalTokens: number; totalCost: string | null; knownCost: string | null; isCostComplete: boolean; unpricedEventCount: number; totalEvents: number }

function formatNumber(num: number) {
  if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return num.toString();
}

function formatCurrency(value: string | null) {
  if (value === null) return 'Unavailable';
  try {
    const amount = new Big(value);
    const fixed = amount.abs().toFixed(Math.max(2, amount.dp()));
    const [integer, fraction] = fixed.split('.');
    const groupedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${amount.lt(0) ? '-' : ''}$${groupedInteger}.${fraction}`;
  } catch {
    return 'Unavailable';
  }
}

function exceedsCostThreshold(value: string | null, threshold: string) {
  try {
    return new Big(value ?? '0').gt(threshold);
  } catch {
    return false;
  }
}

async function responseError(response: Response, fallback: string) {
  try {
    const body = await response.json();
    if (typeof body.error === 'string') return body.error;
  } catch {
    // Use the fallback when the server did not return JSON.
  }
  return `${fallback} (HTTP ${response.status})`;
}

function UsageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // State
  const [events, setEvents] = useState<UsageEventRow[]>([]);
  const [summary, setSummary] = useState<UsageSummary>({ totalRequests: 0, totalTokens: 0, totalCost: null, knownCost: '0', isCostComplete: true, unpricedEventCount: 0, totalEvents: 0 });
  const [filterOptions, setFilterOptions] = useState<{ providers: string[]; models: string[]; workloads: WorkloadOption[] }>({ providers: [], models: [], workloads: [] });
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadSequence, setReloadSequence] = useState(0);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const [importErrors, setImportErrors] = useState<Array<{ row: number; message: string }>>([]);

  async function importCsv(file?: File) {
    if (!file) return;
    setImporting(true); setImportMessage(''); setImportErrors([]);
    try {
      const form = new FormData(); form.append('file', file);
      const response = await fetch('/api/v1/usage/import', { method: 'POST', body: form });
      if (!response.ok && response.status !== 207) throw new Error(await responseError(response, 'CSV import failed'));
      const result = await response.json();
      setImportMessage(`${result.message} ${result.accepted} accepted/imported, ${result.rejected} rejected, ${result.duplicates} duplicates skipped.`);
      setImportErrors(result.errors || []);
      if (result.imported > 0) router.refresh();
    } catch (error) { setImportMessage(error instanceof Error ? error.message : 'CSV import failed.'); }
    finally { setImporting(false); }
  }

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
    let active = true;
    async function loadUsage() {
      setLoading(true);
      setLoadError(null);
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
        if (!res.ok) throw new Error(await responseError(res, 'Could not load usage data'));
        const data = await res.json();
        if (!active) return;
        setEvents(data.events || []);
        setSummary(data.summary || { totalRequests: 0, totalTokens: 0, totalCost: null, knownCost: '0', isCostComplete: true, unpricedEventCount: 0, totalEvents: 0 });
        setFilterOptions(data.filters || { providers: [], models: [], workloads: [] });
        setPagination(data.pagination || { page: 1, limit: 50, total: 0, totalPages: 0 });
      } catch (err) {
        if (active) {
          setEvents([]);
          setLoadError(err instanceof Error ? err.message : 'Could not load usage data. Please try again.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    loadUsage();
    return () => { active = false; };
  }, [range, provider, model, workloadId, pageParam, reloadSequence]);

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
            {filterOptions.workloads.map((w) => (
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

      {loadError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <span>Usage data could not be loaded: {loadError}</span>
        <button className="rounded-md border border-red-300 px-3 py-1.5 font-medium hover:bg-red-100" onClick={() => setReloadSequence(sequence => sequence + 1)}>Retry</button>
      </div>}

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Import usage CSV</h2>
          <p className="mt-1 text-sm text-gray-500">CSV import is the supported V0 ingestion workflow. No provider credentials are stored or sent by this screen.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a className="text-sm font-medium text-blue-700 underline" href="/samples/stackaudit-usage.csv" download>Download sample CSV</a>
          <label className="text-sm text-gray-600">Choose a CSV file
            <input className="ml-2 text-sm" type="file" accept=".csv,text/csv" disabled={importing} onChange={event => { void importCsv(event.target.files?.[0]); event.target.value = ''; }} />
          </label>
          {importing && <span className="text-sm text-gray-500">Validating and importing…</span>}
        </div>
        <p className="text-xs text-gray-500">Required columns: provider, model, timestamp, input_tokens, output_tokens, provider_reference. Optional: cache_read_tokens, cache_creation_tokens, request_count, api_key_id. Maximum 5 MB and 10,000 rows. Include api_key_id to apply a matching workload attribution rule.</p>
        {importMessage && <div role="status" className="text-sm text-gray-800">{importMessage}</div>}
        {importErrors.length > 0 && <div className="max-h-40 overflow-auto rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" aria-label="CSV row errors">
          {importErrors.map((error, index) => <div key={`${error.row}-${index}`}>Row {error.row}: {error.message}</div>)}
        </div>}
        <div className="grid gap-2 border-t border-gray-100 pt-3 text-xs text-gray-600 sm:grid-cols-2">
          <p><strong>Provider connections:</strong> none are supported in the UI.</p>
          <p><strong>CSV import:</strong> supported for canonical usage rows.</p>
          <p><strong>Library primitives:</strong> OpenAI and Anthropic adapters exist but are not connected ingestion flows.</p>
          <p><strong>Planned integrations:</strong> none are promised for this V0.</p>
        </div>
      </section>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col justify-center">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <Activity className="w-4 h-4" />
            <h3 className="text-sm font-medium">Total Requests</h3>
          </div>
          <div className="text-2xl font-semibold text-gray-900">
            {loading || loadError ? '-' : formatNumber(summary.totalRequests)}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col justify-center">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <Zap className="w-4 h-4" />
            <h3 className="text-sm font-medium">Total Tokens</h3>
          </div>
          <div className="text-2xl font-semibold text-gray-900">
            {loading || loadError ? '-' : formatNumber(summary.totalTokens)}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col justify-center">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <DollarSign className="w-4 h-4" />
            <h3 className="text-sm font-medium">Total Cost</h3>
          </div>
          <div className="text-2xl font-semibold text-gray-900">
            {loading || loadError ? '-' : summary.totalCost !== null ? formatCurrency(summary.totalCost) : summary.knownCost !== null ? `${formatCurrency(summary.knownCost)} partial` : 'Unavailable'}
          </div>
          {!loading && !summary.isCostComplete && <div className="text-xs text-amber-700 mt-1">{summary.unpricedEventCount} events have unknown pricing</div>}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-sm text-gray-400 border border-gray-200 rounded-xl bg-white shadow-sm">
          Loading usage events...
        </div>
      ) : loadError ? null : events.length === 0 ? (
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
                  const isAnomaly = !e.is_unpriced && (e.request_count ?? 1) > 1000 && exceedsCostThreshold(e.calculated_cost, '5');
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
                          {e.is_unpriced
                            ? <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-1 font-sans text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200" title="No matching price was found; zero is a placeholder, not the event cost.">Unpriced</span>
                            : formatCurrency(e.calculated_cost ?? '0')}
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
