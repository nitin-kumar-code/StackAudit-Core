/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import DashboardPage from '../../app/app/dashboard/page';
import '@testing-library/jest-dom';
import type { ReactNode } from 'react';

// Mock Recharts to avoid DOM layout errors in JSDOM
vi.mock('recharts', () => {
  const Original = vi.importActual('recharts');
  return {
    ...Original,
    ResponsiveContainer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    LineChart: () => <div>LineChartMock</div>,
  };
});

describe('Dashboard UI', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders loading state initially', () => {
    global.fetch = vi.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch;
    render(<DashboardPage />);
    expect(screen.getByText(/Loading dashboard/i)).toBeInTheDocument();
  });

  it('renders KPI values accurately', async () => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v1/dashboard/trends')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          totalCost: 1234.56,
          totalTokens: 500000,
          totalRequests: 100,
          activeAlerts: 2,
          outcomes: {
            totalCount: 50,
            primaryCpo: { outcomeType: 'ticket_resolved', costPerOutcome: '24.69' }
          }
        })
      });
    }) as unknown as typeof fetch;

    render(<DashboardPage />);
    
    await waitFor(() => {
      expect(screen.getByText('$1234.56')).toBeInTheDocument();
      expect(screen.getByText('$24.690')).toBeInTheDocument();
      expect(screen.getByText('500.0K tokens')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('handles multiple outcome types securely (C6)', async () => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v1/dashboard/trends')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          totalCost: 1000,
          outcomes: {
            primaryCpo: { outcomeType: 'Multiple', costPerOutcome: null }
          }
        })
      });
    }) as unknown as typeof fetch;

    render(<DashboardPage />);
    
    await waitFor(() => {
      expect(screen.getByText('—')).toBeInTheDocument(); // CPO is null
      expect(screen.getByText(/Multiple types/i)).toBeInTheDocument();
    });
  });
});
