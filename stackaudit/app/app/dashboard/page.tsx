'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface DashboardAlert { id: string; category: string; workloadName?: string; finding?: { title?: string; evidence?: { change?: number; drift?: number } } }
interface WorkloadSummary { id: string; name: string; cost: string | null; knownCost: string | null; usage: number; outcomes: number; costPerOutcome: number | null; changePct: number }
interface CostChangeEvidence { workloadName: string; title: string; evidence?: { change?: number; drift?: number; baseline_cost?: number; baseline?: number } }
interface DashboardSummary {
  totalCost: string | null; knownCost: string | null; isCostComplete?: boolean; unpricedEventCount?: number;
  unattributedEventCount?: number; unattributedKnownCost?: string | null; totalTokens?: number; totalRequests?: number;
  activeAlerts: number; outcomes?: { primaryCpo?: { costPerOutcome: string | null; availabilityReason?: string | null; outcomeType?: string } };
  recentAlerts?: DashboardAlert[]; workloadSummaries?: WorkloadSummary[]; costChangeEvidence?: CostChangeEvidence[];
}
interface TrendPoint { date: string; cost: string | null; tokens: number; outcomes: number }

function formatNumber(num: number) {
  if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

export default function DashboardPage() {
  const [days, setDays] = useState(90);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const end = new Date().toISOString();
        const start = new Date(Date.now() - days * 86400000).toISOString();
        
        const [sumRes, trendRes] = await Promise.all([
          fetch(`/api/v1/dashboard/summary?start=${start}&end=${end}`),
          fetch(`/api/v1/dashboard/trends?start=${start}&end=${end}`)
        ]);

        if (!sumRes.ok) throw new Error(`Summary API failed: ${await sumRes.text()}`);
        if (!trendRes.ok) throw new Error(`Trends API failed: ${await trendRes.text()}`);

        setSummary(await sumRes.json());
        setTrends(await trendRes.json());
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Unable to load dashboard data');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [days]);

  if (error) return <div className="p-8 text-red-600">Error: {error}</div>;
  if (!summary) return <div className="p-8 text-muted-foreground">Loading dashboard...</div>;

  return (
    <div className="space-y-8 max-w-6xl pb-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">AI Cost Overview</h1>
        <select 
          value={days} 
          onChange={(e) => setDays(Number(e.target.value))}
          className="text-sm bg-card text-foreground border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent cursor-pointer shadow-sm"
        >
          <option value={1}>Last 24 Hours</option>
          <option value={7}>Last 7 Days</option>
          <option value={30}>Last 30 Days</option>
          <option value={90}>Last 90 Days</option>
        </select>
      </div>
      
      {loading && !summary ? (
        <div className="text-muted-foreground">Loading dashboard...</div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MetricCard
              title="Total Cost"
              value={summary.totalCost != null ? `$${Number(summary.totalCost).toFixed(2)}` : summary.knownCost != null ? `$${Number(summary.knownCost).toFixed(2)} partial` : 'Unavailable'}
              subtitle={[
                summary.isCostComplete === false ? `${summary.unpricedEventCount} events have unknown pricing` : null,
                (summary.unattributedEventCount ?? 0) > 0 ? `${summary.unattributedEventCount} unassigned events (${summary.unattributedKnownCost != null ? `$${Number(summary.unattributedKnownCost).toFixed(2)} known cost` : 'cost unavailable'})` : null
              ].filter(Boolean).join(' · ') || undefined}
            />
            
            <MetricCard 
              title="Cost / Outcome" 
              value={summary.outcomes?.primaryCpo?.costPerOutcome ? `$${Number(summary.outcomes.primaryCpo.costPerOutcome).toFixed(3)}` : '—'} 
              subtitle={
                summary.outcomes?.primaryCpo?.availabilityReason || (summary.outcomes?.primaryCpo?.outcomeType === 'Multiple' ? 'Multiple types exist; view workload-specific metrics.' : 'View workload and outcome-specific metrics.')
              }
            />
            
            <MetricCard 
              title="AI Usage" 
              value={`${formatNumber(summary.totalTokens || 0)} tokens`} 
              subtitle={`${formatNumber(summary.totalRequests || 0)} requests`} 
            />
            
            <MetricCard 
              title="Active Alerts" 
              value={summary.activeAlerts || 0} 
              link={summary.activeAlerts > 0 ? '/app/alerts' : undefined}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="border border-border rounded-xl bg-card p-6 shadow-sm xl:col-span-2">
              <TrendChart trends={trends} />
            </div>

            <div className="border border-border rounded-xl bg-card p-6 shadow-sm flex flex-col">
              <h2 className="font-medium text-foreground mb-4">Recent Alerts</h2>
              {summary.recentAlerts && summary.recentAlerts.length > 0 ? (
                <div className="space-y-3 overflow-y-auto pr-2">
                  {summary.recentAlerts.map((alert) => (
                    <div key={alert.id} className="p-4 bg-red-50/30 border border-red-100/50 rounded-xl text-sm flex flex-col relative group">
                      <div className="flex items-start justify-between mb-2">
                        <span className="font-medium text-red-900 flex items-center">
                          <span className="text-red-500 mr-2">⚠</span> 
                          {alert.finding?.title || alert.category}
                        </span>
                      </div>
                      <div className="text-muted-foreground mb-3">{alert.workloadName}</div>
                      
                      {alert.finding?.evidence && (
                        <div className="text-xs text-foreground/80 mb-3 bg-white/60 p-2 rounded border border-red-100/30">
                          {alert.category === 'USAGE_SPIKE' && alert.finding.evidence.change ? `Spike: +${(alert.finding.evidence.change * 100).toFixed(0)}%` : ''}
                          {alert.category === 'COST_DRIFT' && alert.finding.evidence.drift ? `Drift: +${(alert.finding.evidence.drift * 100).toFixed(0)}%` : ''}
                        </div>
                      )}
                      
                      <Link href={`/app/alerts`} className="text-red-700 font-medium hover:underline text-xs mt-auto inline-block">
                        View Alert &rarr;
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground py-8 text-center flex-1 flex items-center justify-center">
                  <div>
                    <div className="mb-1 text-foreground font-medium">No active alerts</div>
                    Monitoring has not detected a configured anomaly.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Workload Economics Table */}
          <div className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">Workload Economics</h2>
            {summary.workloadSummaries && summary.workloadSummaries.length > 0 ? (
              <div className="border border-border rounded-xl bg-card overflow-x-auto shadow-sm">
                <table className="w-full text-sm text-left">
                  <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase font-medium border-b border-border">
                    <tr>
                      <th className="px-6 py-4">Workload</th>
                      <th className="px-6 py-4">Cost</th>
                      <th className="px-6 py-4">Usage</th>
                      <th className="px-6 py-4">Outcomes</th>
                      <th className="px-6 py-4">Cost / Outcome</th>
                      <th className="px-6 py-4" title="Change in Cost per Outcome over selected period">Change</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {summary.workloadSummaries.map((w) => (
                      <tr key={w.id} className="hover:bg-secondary/30 transition-colors group cursor-pointer">
                        <td className="px-6 py-4 font-medium text-foreground relative">
                          <Link href={`/app/workloads/${w.id}`} className="absolute inset-0 z-10"></Link>
                          {w.name}
                        </td>
                        <td className="px-6 py-4">{w.cost !== null ? `$${Number(w.cost).toFixed(2)}` : w.knownCost !== null ? `$${Number(w.knownCost).toFixed(2)} partial` : 'Unavailable'}</td>
                        <td className="px-6 py-4 text-muted-foreground">{formatNumber(w.usage)} tkns</td>
                        <td className="px-6 py-4">{formatNumber(w.outcomes)}</td>
                        <td className="px-6 py-4 font-medium">{w.costPerOutcome ? `$${w.costPerOutcome.toFixed(3)}` : '—'}</td>
                        <td className="px-6 py-4">
                          {w.changePct > 0 ? (
                            <span className="text-red-600 bg-red-50 px-2 py-1 rounded text-xs font-medium">↑ {w.changePct}%</span>
                          ) : w.changePct < 0 ? (
                            <span className="text-green-600 bg-green-50 px-2 py-1 rounded text-xs font-medium">↓ {Math.abs(w.changePct)}%</span>
                          ) : (
                            <span className="text-muted-foreground text-xs font-medium">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="border border-border rounded-xl bg-card p-12 text-center shadow-sm">
                <div className="text-foreground font-medium mb-1">No workloads configured</div>
                <div className="text-sm text-muted-foreground mb-4">Create a workload to start measuring AI economics.</div>
                <Link href="/app/workloads" className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium hover:bg-primary/90 transition-colors inline-block">
                  Go to Workloads
                </Link>
              </div>
            )}
          </div>

          {/* Why Costs Changed */}
          {summary.costChangeEvidence && summary.costChangeEvidence.length > 0 && (
            <div className="space-y-4 pt-4">
              <h2 className="text-lg font-medium text-foreground">Why costs changed</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {summary.costChangeEvidence.map((ev, i) => (
                  <div key={i} className="border border-border rounded-xl bg-card p-5 shadow-sm text-sm relative group">
                    <Link href={`/app/audits`} className="absolute inset-0 z-10"></Link>
                    <div className="font-medium text-foreground mb-4 border-b border-border pb-3 flex justify-between items-center">
                      {ev.workloadName}
                      <span className="text-muted-foreground text-xs opacity-0 group-hover:opacity-100 transition-opacity">View Audit &rarr;</span>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Observed Change</span>
                        <span className="font-medium text-foreground">
                          {ev.evidence?.change ? `+${(ev.evidence.change * 100).toFixed(0)}%` : 
                           ev.evidence?.drift ? `+${(ev.evidence.drift * 100).toFixed(0)}%` : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Baseline</span>
                        <span className="font-medium text-foreground">
                          {ev.evidence?.baseline_cost ? `$${ev.evidence.baseline_cost.toFixed(2)}` : 
                           ev.evidence?.baseline ? ev.evidence.baseline : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between border-t border-border pt-2 mt-2">
                        <span className="text-muted-foreground">Finding</span>
                        <span className="font-medium text-foreground truncate max-w-[150px]" title={ev.title}>{ev.title}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TrendChart({ trends }: { trends: TrendPoint[] }) {
  const [metric, setMetric] = useState<'cost' | 'tokens' | 'outcomes'>('cost');

  if (!trends || !trends.length) return <div className="h-64 flex items-center justify-center text-muted-foreground">No trend data available.</div>;

  const chartData = trends.map(t => ({ ...t, cost: t.cost === null ? null : Number(t.cost) }));

  const config = {
    cost: { key: 'cost', color: '#171717', formatter: (val: number) => `$${val.toFixed(2)}`, label: 'Total Cost' },
    tokens: { key: 'tokens', color: '#171717', formatter: (val: number) => formatNumber(val), label: 'Tokens' },
    outcomes: { key: 'outcomes', color: '#171717', formatter: (val: number) => formatNumber(val), label: 'Outcomes' },
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-medium text-foreground">Trend Analysis</h2>
        <div className="flex bg-secondary p-1 rounded-lg">
          {(Object.keys(config) as Array<keyof typeof config>).map(key => (
            <button
              key={key}
              onClick={() => setMetric(key)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${metric === key ? 'bg-background text-foreground shadow-sm border border-border/50' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {config[key].label}
            </button>
          ))}
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.5} />
            <XAxis 
              dataKey="date" 
              tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: 'var(--color-muted-foreground)' }}
              dy={10}
              minTickGap={20}
            />
            <YAxis 
              yAxisId="left"
              axisLine={false}
              tickLine={false}
              tickFormatter={config[metric].formatter}
              tick={{ fontSize: 12, fill: 'var(--color-muted-foreground)' }}
              width={60}
            />
            <Tooltip 
              formatter={(value) => [config[metric].formatter(Number(value)), config[metric].label]}
              labelFormatter={(label) => new Date(label).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
              contentStyle={{ borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-card)', fontSize: '13px', padding: '10px 14px' }}
              itemStyle={{ color: 'var(--color-foreground)', fontWeight: 500, padding: 0, marginTop: 4 }}
              labelStyle={{ color: 'var(--color-muted-foreground)', marginBottom: 4 }}
              cursor={{ stroke: 'var(--color-border)', strokeWidth: 1, strokeDasharray: '3 3' }}
            />
            <Line 
              yAxisId="left" 
              type="monotone" 
              dataKey={config[metric].key} 
              stroke={config[metric].color} 
              strokeWidth={2} 
              dot={false} 
              activeDot={{ r: 4, fill: config[metric].color, stroke: 'var(--color-card)', strokeWidth: 2 }} 
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function MetricCard({ title, value, subtitle, link }: { title: string, value: string | number, subtitle?: string, link?: string }) {
  const content = (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm h-full flex flex-col relative group transition-colors hover:border-border/80">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{title}</div>
      <div className="text-2xl font-semibold text-foreground mb-1">{value}</div>
      {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
      
      {link && (
        <div className="mt-auto pt-4 text-xs font-medium text-foreground/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
          View details <span className="ml-1">→</span>
        </div>
      )}
    </div>
  );

  if (link) {
    return <Link href={link} className="block h-full">{content}</Link>;
  }
  return content;
}
