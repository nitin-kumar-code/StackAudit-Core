'use client';

export default function SettingsPage() {
  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-gray-500 mt-1">Configure your local open-source installation.</p>
      </div>

      <section className="bg-white border rounded-lg shadow-sm p-6">
        <h2 className="text-lg font-medium mb-4">Monitoring Configuration</h2>
        <div className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-gray-700">Webhook Endpoint</label>
            <input 
              type="text" 
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 sm:text-sm" 
              placeholder="https://hooks.slack.com/services/..."
              disabled
              value="Configured via backend API"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Evaluation Window (Days)</label>
            <input 
              type="number" 
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 sm:text-sm" 
              defaultValue={7}
              disabled
            />
          </div>
          <p className="text-xs text-gray-500">V0 Dashboard requires configuring these settings via the API directly.</p>
        </div>
      </section>

      <section className="bg-white border rounded-lg shadow-sm p-6">
        <h2 className="text-lg font-medium mb-4">Provider Integration</h2>
        <p className="text-sm text-gray-500 mb-4">
          Cost calculations are executed deterministically based on the offline Pricing Catalog. 
          Provider syncing (Phase 4 adapters) must be executed server-side to ingest new CSVs or API traces.
        </p>
      </section>
    </div>
  );
}
