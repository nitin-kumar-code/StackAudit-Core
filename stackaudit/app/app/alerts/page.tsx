'use client';
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, Clock } from 'lucide-react';

interface AlertRow { id: string; severity: string; category: string; fingerprint: string; created_at: string; status: string }

async function responseError(response: Response, fallback: string) {
  try {
    const body = await response.json();
    if (typeof body.error === 'string') return body.error;
  } catch {
    // Use the fallback when the server did not return JSON.
  }
  return `${fallback} (HTTP ${response.status})`;
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningMonitoring, setRunningMonitoring] = useState(false);

  const loadAlerts = useCallback(async (options: { signal?: AbortSignal; showLoading?: boolean } = {}) => {
    if (options.showLoading) setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/alerts', { signal: options.signal });
      if (!res.ok) throw new Error(await responseError(res, 'Could not load alerts'));
      const data = await res.json();
      setAlerts(data.alerts || []);
    } catch (err) {
      if (options.signal?.aborted) return;
      setError(err instanceof Error ? err.message : 'Could not load alerts. Please try again.');
    } finally {
      if (options.showLoading && !options.signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadAlerts({ signal: controller.signal, showLoading: true });
    return () => controller.abort();
  }, [loadAlerts]);

  async function updateStatus(id: string, action: 'acknowledge' | 'resolve') {
    setError(null);
    try {
      const res = await fetch(`/api/v1/alerts/${id}/${action}`, { method: 'POST' });
      if (!res.ok) throw new Error(await responseError(res, 'Could not update the alert'));
      await loadAlerts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the alert. Please try again.');
    }
  }

  async function runMonitoring() {
    setError(null);
    setRunningMonitoring(true);
    try {
      const res = await fetch('/api/v1/monitoring/run', { method: 'POST' });
      if (!res.ok) throw new Error(await responseError(res, 'Could not run monitoring'));
      await loadAlerts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not run monitoring. Please try again.');
    } finally {
      setRunningMonitoring(false);
    }
  }

  if (loading) return <div className="p-8 text-muted-foreground">Loading alerts...</div>;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Active Alerts</h1>
        <button
          onClick={runMonitoring}
          disabled={runningMonitoring}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 text-sm font-medium disabled:opacity-60"
        >
          {runningMonitoring ? 'Running…' : 'Run Monitoring'}
        </button>
      </div>

      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <span>{error}</span>
        <button className="rounded-md border border-red-300 px-3 py-1.5 font-medium hover:bg-red-100" onClick={() => void loadAlerts({ showLoading: true })}>Retry</button>
      </div>}

      {!error && alerts.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center text-muted-foreground bg-card">
          <CheckCircle className="w-8 h-8 mx-auto mb-4 text-green-500" />
          <h3 className="text-lg font-medium text-foreground mb-1">No active alerts</h3>
          <p>Monitoring has not detected any configured anomalies.</p>
        </div>
      ) : !error ? (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <div key={alert.id} className="bg-card border rounded-lg shadow-sm p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-l-4 border-l-red-500">
              <div>
                <div className="flex items-center space-x-2 mb-1">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                    alert.severity === 'HIGH' ? 'bg-red-100 text-red-800' :
                    alert.severity === 'MEDIUM' ? 'bg-orange-100 text-orange-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {alert.severity}
                  </span>
                  <span className="text-sm text-muted-foreground font-mono">{alert.category}</span>
                </div>
                <h3 className="font-medium text-foreground text-lg">{alert.fingerprint}</h3>
                <div className="text-sm text-muted-foreground mt-1 flex items-center">
                  <Clock className="w-4 h-4 mr-1" />
                  First triggered: {Number.isNaN(new Date(alert.created_at).getTime()) ? '—' : new Date(alert.created_at).toLocaleString()}
                </div>
              </div>
              
              <div className="flex items-center space-x-3 shrink-0">
                <span className="text-sm font-medium text-foreground/80 bg-secondary px-3 py-1 rounded-full">
                  Status: {alert.status}
                </span>
                {alert.status === 'OPEN' && (
                  <button 
                    onClick={() => updateStatus(alert.id, 'acknowledge')}
                    className="px-4 py-2 border border-border rounded-md text-sm font-medium hover:bg-muted/50"
                  >
                    Acknowledge
                  </button>
                )}
                {(alert.status === 'OPEN' || alert.status === 'ACKNOWLEDGED') && (
                  <button 
                    onClick={() => updateStatus(alert.id, 'resolve')}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
                  >
                    Resolve
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
