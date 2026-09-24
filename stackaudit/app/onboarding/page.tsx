'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function OnboardingPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/v1/auth/setup-org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationName: orgName })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to setup organization');
      }

      router.push('/app/dashboard');
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full bg-card rounded-lg shadow-sm border p-8">
        <h1 className="text-2xl font-semibold mb-2 tracking-tight">Welcome to AI Cost Intelligence</h1>
        <p className="text-muted-foreground mb-6">Let's set up your organization space to begin tracking AI costs.</p>
        
        <form onSubmit={handleSetup} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Organization Name</label>
            <input 
              type="text" 
              required
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g. Acme Corp"
            />
          </div>
          
          {error && <div className="text-red-600 text-sm">{error}</div>}
          
          <button 
            type="submit" 
            disabled={loading || !orgName.trim()}
            className="w-full bg-primary text-primary-foreground font-medium py-2 rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Setting up...' : 'Create Organization'}
          </button>
        </form>
      </div>
    </div>
  );
}
