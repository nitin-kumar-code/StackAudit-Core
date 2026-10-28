'use client';
import { useEffect, useState } from 'react';
import { CheckCircle, Clock } from 'lucide-react';

interface AlertRow { id: string; severity: string; category: string; fingerprint: string; first_triggered_at: string; status: string }

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadAlerts() {
    try {
      const res = await fetch('/api/v1/alerts');
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function loadInitialAlerts() {
      try {
        const res = await fetch('/api/v1/alerts');
        if (res.ok) {
          const data = await res.json();
          if (active) setAlerts(data.alerts || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadInitialAlerts();
    return () => { active = false; };
  }, []);

  async function updateStatus(id: string, action: 'acknowledge' | 'resolve') {
    try {
      await fetch(`/api/v1/alerts/${id}/${action}`, { method: 'POST' });
      loadAlerts(); // refresh
    } catch (err) {
      console.error(err);
    }
  }

  if (loading) return <div className="p-8 text-muted-foreground">Loading alerts...</div>;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Active Alerts</h1>
        <button 
          onClick={() => fetch('/api/v1/internal/monitoring/run', { method: 'POST' })}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 text-sm font-medium"
        >
          Run Monitoring
        </button>
      </div>

      {alerts.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center text-muted-foreground bg-card">
          <CheckCircle className="w-8 h-8 mx-auto mb-4 text-green-500" />
          <h3 className="text-lg font-medium text-foreground mb-1">No active alerts</h3>
          <p>Monitoring has not detected any configured anomalies.</p>
        </div>
      ) : (
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
                  First triggered: {new Date(alert.first_triggered_at).toLocaleString()}
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
