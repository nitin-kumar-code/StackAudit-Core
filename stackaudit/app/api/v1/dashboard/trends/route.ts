import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase/client';
import { getAuthOrgId, UnauthorizedError, ForbiddenError } from '../../../../../lib/auth';
import { aggregateUsageCosts, getTotalTokenCount } from '../../../../../core/usage/metrics';

export async function GET(req: Request) {
  try {
    const orgId = await getAuthOrgId(req);
    const url = new URL(req.url);
    const startParam = url.searchParams.get('start');
    const endParam = url.searchParams.get('end');

    if (!startParam || !endParam) {
      return NextResponse.json({ error: 'Missing start or end parameters' }, { status: 400 });
    }

    // Call usage_events directly to bypass missing RPC on remote DBs
    const { data: rawUsage, error: trendsError } = await supabaseAdmin
      .from('usage_events')
      .select('timestamp, calculated_cost, is_unpriced, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens')
      .eq('organization_id', orgId)
      .gte('timestamp', startParam)
      .lt('timestamp', endParam);

    if (trendsError) throw new Error(`Failed to load trends: ${trendsError.message}`);

    // Fetch workloads first to filter outcome_events
    const { data: workloads } = await supabaseAdmin
      .from('workloads')
      .select('id')
      .eq('organization_id', orgId);
      
    const workloadIds = (workloads || []).map(w => w.id);

    // Call outcome_events directly for daily outcome sums
    const { data: outcomesData, error: outcomesError } = await supabaseAdmin
      .from('outcome_events')
      .select('timestamp, count')
      .in('workload_id', workloadIds.length ? workloadIds : ['00000000-0000-0000-0000-000000000000'])
      .gte('timestamp', startParam)
      .lt('timestamp', endParam);

    if (outcomesError) throw new Error(`Failed to load outcomes: ${outcomesError.message}`);

    const byDay: Record<string, { costs: any[]; tokens: number; outcomes: number }> = {};

    (rawUsage || []).forEach((row: any) => {
      const day = new Date(row.timestamp).toISOString().split('T')[0];
      if (!byDay[day]) byDay[day] = { costs: [], tokens: 0, outcomes: 0 };
      byDay[day].costs.push(row);
      byDay[day].tokens += getTotalTokenCount(row);
    });

    (outcomesData || []).forEach((row: any) => {
      const day = new Date(row.timestamp).toISOString().split('T')[0];
      if (!byDay[day]) byDay[day] = { costs: [], tokens: 0, outcomes: 0 };
      byDay[day].outcomes += row.count;
    });

    const merged = Object.keys(byDay).sort().map(date => ({
      date,
      cost: aggregateUsageCosts(byDay[date].costs).totalCost,
      knownCost: aggregateUsageCosts(byDay[date].costs).knownCost,
      isCostComplete: aggregateUsageCosts(byDay[date].costs).isComplete,
      pricedEventCount: aggregateUsageCosts(byDay[date].costs).pricedEventCount,
      unpricedEventCount: aggregateUsageCosts(byDay[date].costs).unpricedEventCount,
      tokens: byDay[date].tokens,
      outcomes: byDay[date].outcomes
    }));

    return NextResponse.json(merged, { status: 200 });
  } catch (error: any) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error('Dashboard Trends Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
