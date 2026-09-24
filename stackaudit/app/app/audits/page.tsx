'use client';
import { useEffect, useState } from 'react';
import { ShieldAlert, Search } from 'lucide-react';

export default function AuditsPage() {
  const [findings, setFindings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  async function loadFindings() {
    try {
      const res = await fetch(`/api/v1/audits`);
      if (res.ok) {
        const data = await res.json();
        setFindings(data.findings || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFindings();
  }, []);

  async function handleRunAudit() {
    setRunning(true);
    await loadFindings();
    setRunning(false);
  }

  if (loading) return <div className="p-8 text-muted-foreground">Loading audit findings...</div>;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit Findings</h1>
          <p className="text-muted-foreground mt-1">Evidence-based anomalies and cost drifts detected across your workloads.</p>
        </div>
        <button 
          onClick={handleRunAudit}
          disabled={running}
          className="flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 text-sm font-medium"
        >
          <Search className="w-4 h-4 mr-2" />
          {running ? 'Running Audit...' : 'Run Audit'}
        </button>
      </div>

      {findings.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center text-muted-foreground bg-card">
          <ShieldAlert className="w-8 h-8 mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="text-lg font-medium text-foreground mb-1">No findings</h3>
          <p>The audit engine found no anomalies in the current period.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {findings.map((finding, idx) => (
            <div key={idx} className="bg-card border rounded-lg shadow-sm p-5 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                    finding.severity === 'HIGH' ? 'bg-red-100 text-red-800' :
                    finding.severity === 'MEDIUM' ? 'bg-orange-100 text-orange-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {finding.severity}
                  </span>
                  <h3 className="font-medium text-foreground mt-2">{finding.category}</h3>
                  <p className="text-sm text-muted-foreground">{finding.workloadId}</p>
                </div>
                <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded border">
                  Confidence: {finding.confidence}
                </span>
              </div>
              
              <div className="bg-muted/50 p-3 rounded text-sm border font-mono text-foreground/70">
                <pre>{JSON.stringify(finding.evidence, null, 2)}</pre>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
