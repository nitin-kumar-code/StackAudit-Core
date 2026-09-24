'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function DashboardPage() {
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadData() {
      try {
        // Hardcoding a 90-day window for V0 prototype
        const end = new Date().toISOString();
        const start = new Date(Date.now() - 90 * 86400000).toISOString();
        const res = await fetch(`/api/v1/dashboard/summary?start=${start}&end=${end}`);
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Failed to load dashboard summary (Status: ${res.status}). Response: ${text}`);
        }
        const data = await res.json();
        setSummary(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) return <div className="p-8 text-muted-foreground">Loading dashboard...</div>;
  if (error) return <div className="p-8 text-red-600">Error: {error}</div>;

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">AI Cost Overview</h1>
      
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard title="Total Cost" value={`$${summary?.totalCost?.toFixed(2) || '0.00'}`} />
        <MetricCard 
          title="Cost / Outcome" 
          value={summary?.outcomes?.primaryCpo?.costPerOutcome 
            ? `$${summary.outcomes.primaryCpo.costPerOutcome}` 
            : '—'} 
          subtitle={summary?.outcomes?.primaryCpo?.outcomeType === 'Multiple' 
            ? 'Multiple types (see Workloads)' 
            : summary?.outcomes?.primaryCpo?.outcomeType || 'No outcome data'}
        />
        <MetricCard title="AI Usage" value={`${(summary?.totalTokens / 1000).toFixed(1)}k tokens`} subtitle={`${summary?.totalRequests} requests`} />
        <MetricCard title="Active Alerts" value={summary?.activeAlerts || 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="border border-border rounded-xl bg-card p-6 shadow-sm lg:col-span-2">
          <h2 className="font-medium text-foreground mb-4">Cost & Outcome Trend</h2>
          <div className="h-64">
            <TrendChart />
          </div>
        </div>

        <div className="border border-border rounded-xl bg-card p-6 shadow-sm">
          <h2 className="font-medium text-foreground mb-4">Recent Alerts</h2>
          {summary?.activeAlerts > 0 ? (
            <div className="space-y-3">
              <div className="p-3 bg-red-50/50 border border-red-100 rounded-lg text-sm flex justify-between items-center">
                <span className="font-medium text-red-800">Anomaly Detected</span>
                <Link href="/app/alerts" className="text-red-600 hover:underline">View All &rarr;</Link>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground py-8 text-center">No active alerts. Monitoring has not detected a configured anomaly.</div>
          )}
        </div>
      </div>
    </div>
  );
}

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function TrendChart() {
  const [data, setData] = useState<any[]>([]);
  useEffect(() => {
    async function loadTrends() {
      const end = new Date().toISOString();
      const start = new Date(Date.now() - 90 * 86400000).toISOString();
      const res = await fetch(`/api/v1/dashboard/trends?start=${start}&end=${end}`);
      if (res.ok) {
        setData(await res.json());
      }
    }
    loadTrends();
  }, []);

  if (!data.length) return <div className="h-full flex items-center justify-center text-muted-foreground">Loading chart...</div>;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.5} />
        <XAxis 
          dataKey="date" 
          tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 12, fill: 'var(--color-muted-foreground)' }}
          dy={10}
        />
        <YAxis 
          yAxisId="left"
          axisLine={false}
          tickLine={false}
          tickFormatter={(val) => `$${val}`}
          tick={{ fontSize: 12, fill: 'var(--color-muted-foreground)' }}
        />
        <Tooltip 
          formatter={(value: any) => [`$${Number(value).toFixed(2)}`, 'Cost']}
          labelFormatter={(label) => new Date(label).toLocaleDateString()}
          contentStyle={{ borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-card)' }}
        />
        <Line yAxisId="left" type="monotone" dataKey="cost" stroke="var(--color-foreground)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function MetricCard({ title, value, subtitle }: { title: string, value: string | number, subtitle?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{title}</div>
      <div className="text-2xl font-semibold text-foreground">{value}</div>
      {subtitle && <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>}
    </div>
  );
}
