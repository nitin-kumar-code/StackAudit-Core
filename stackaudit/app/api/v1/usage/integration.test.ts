import { describe, it, expect } from 'vitest';
import { GET as getDashboardSummary } from '../dashboard/summary/route';
import { GET as getUsage } from './route';

// Helper to construct a mock request
function makeRequest(urlPath: string, searchParams: Record<string, string>) {
  const url = new URL(`http://localhost${urlPath}`);
  for (const [k, v] of Object.entries(searchParams)) {
    url.searchParams.set(k, v);
  }
  return new Request(url.toString(), {
    method: 'GET',
    headers: new Headers({
      'cookie': 'mock=cookie' // Bypass potential cookie errors
    })
  });
}

describe('Overview and Usage Data Reconciliation', () => {
  const ranges = [90, 30, 7];

  for (const days of ranges) {
    it(`Reconciles total cost, tokens, and requests for the last ${days} days`, async () => {
      const start = new Date(Date.now() - days * 86400000).toISOString();
      const end = new Date().toISOString();

      // 1. Fetch Dashboard Summary
      const reqDash = makeRequest('/api/v1/dashboard/summary', { start, end });
      const resDash = await getDashboardSummary(reqDash);
      const dashData = await resDash.json();

      // 2. Fetch Usage Summary
      const reqUsage = makeRequest('/api/v1/usage', { start, end, limit: '1' });
      const resUsage = await getUsage(reqUsage);
      const usageData = await resUsage.json();

      // Ensure they both fetched successfully
      expect(resDash.status).toBe(200);
      expect(resUsage.status).toBe(200);

      // Extract metrics
      const dashMetrics = {
        cost: dashData.summary.totalCost,
        tokens: dashData.summary.totalTokens,
        requests: dashData.summary.totalRequests
      };

      const usageMetrics = {
        cost: usageData.summary.totalCost,
        tokens: usageData.summary.totalTokens,
        requests: usageData.summary.totalRequests
      };

      // Ensure they match exactly (within floating point tolerances for cost)
      expect(usageMetrics.requests).toBe(dashMetrics.requests);
      expect(usageMetrics.tokens).toBe(dashMetrics.tokens);
      expect(Math.abs(usageMetrics.cost - dashMetrics.cost)).toBeLessThan(0.0001);
    });
  }
});
