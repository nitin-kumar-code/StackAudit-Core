'use client';
import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Clock } from 'lucide-react';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<any[]>([]);
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
    loadAlerts();
  }, []);

  async function updateStatus(id: string, action: 'acknowledge' | 'resolve') {
    try {
      await fetch(`/api/v1/alerts/${id}/${action}`, { method: 'POST' });
      loadAlerts(); // refresh
    } catch (err) {
      console.error(err);
    }
  }

  if (loading) return <div className="p-8 text-gray-500">Loading alerts...</div>;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Active Alerts</h1>
        <button 
          onClick={() => fetch('/api/v1/internal/monitoring/run', { method: 'POST' })}
          className="px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 text-sm font-medium"
        >
          Run Monitoring
        </button>
      </div>

      {alerts.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center text-gray-500 bg-white">
          <CheckCircle className="w-8 h-8 mx-auto mb-4 text-green-500" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">No active alerts</h3>
          <p>Monitoring has not detected any configured anomalies.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <div key={alert.id} className="bg-white border rounded-lg shadow-sm p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-l-4 border-l-red-500">
              <div>
                <div className="flex items-center space-x-2 mb-1">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                    alert.severity === 'HIGH' ? 'bg-red-100 text-red-800' :
                    alert.severity === 'MEDIUM' ? 'bg-orange-100 text-orange-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {alert.severity}
                  </span>
                  <span className="text-sm text-gray-500 font-mono">{alert.category}</span>
                </div>
                <h3 className="font-medium text-gray-900 text-lg">{alert.fingerprint}</h3>
                <div className="text-sm text-gray-500 mt-1 flex items-center">
                  <Clock className="w-4 h-4 mr-1" />
                  First triggered: {new Date(alert.first_triggered_at).toLocaleString()}
                </div>
              </div>
              
              <div className="flex items-center space-x-3 shrink-0">
                <span className="text-sm font-medium text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                  Status: {alert.status}
                </span>
                {alert.status === 'OPEN' && (
                  <button 
                    onClick={() => updateStatus(alert.id, 'acknowledge')}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-50"
                  >
                    Acknowledge
                  </button>
                )}
                {(alert.status === 'OPEN' || alert.status === 'ACKNOWLEDGED') && (
                  <button 
                    onClick={() => updateStatus(alert.id, 'resolve')}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
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
