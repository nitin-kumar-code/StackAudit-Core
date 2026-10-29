import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase/client';
import { getAuthOrgId, UnauthorizedError, ForbiddenError } from '../../../../../lib/auth';

interface DashboardTrendRow {
  period_start: string;
  known_cost: string | null;
  total_cost: string | null;
  is_cost_complete: boolean;
  priced_events: number;
  unpriced_events: number;
  total_tokens: string;
  request_count: number;
  outcome_count: string;
}

export async function GET(req: Request) {
  try {
    const orgId = await getAuthOrgId(req);
    const url = new URL(req.url);
    const startParam = url.searchParams.get('start');
    const endParam = url.searchParams.get('end');
    if (!startParam || !endParam) {
      return NextResponse.json({ error: 'Missing start or end parameters' }, { status: 400 });
    }

    const start = new Date(startParam);
    const end = new Date(endParam);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
      return NextResponse.json({ error: 'Valid start and end parameters are required' }, { status: 400 });
    }
    if (end.getTime() - start.getTime() > 366 * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: 'Dashboard range cannot exceed 366 days' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc('aggregate_dashboard_trends_v2', {
      p_organization_id: orgId,
      p_start_time: start.toISOString(),
      p_end_time: end.toISOString()
    });
    if (error) throw new Error(`Failed to aggregate dashboard trends: ${error.message}`);

    const rows = (data || []) as DashboardTrendRow[];
    const trends = rows.map(row => ({
      date: new Date(row.period_start).toISOString().slice(0, 10),
      cost: row.total_cost,
      knownCost: row.known_cost,
      isCostComplete: row.is_cost_complete,
      pricedEventCount: Number(row.priced_events),
      unpricedEventCount: Number(row.unpriced_events),
      tokens: Number(row.total_tokens),
      requests: Number(row.request_count),
      outcomes: Number(row.outcome_count)
    }));

    return NextResponse.json(trends, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error('Dashboard Trends Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
