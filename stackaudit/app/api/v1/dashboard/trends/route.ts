import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase/client';
import { getAuthOrgId, UnauthorizedError, ForbiddenError } from '../../../../../lib/auth';

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
      .select('timestamp, calculated_cost, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens')
      .eq('organization_id', orgId)
      .gte('timestamp', startParam)
      .lt('timestamp', endParam);

    if (trendsError) throw new Error(`Failed to load trends: ${trendsError.message}`);

    // Call outcome_events directly for daily outcome sums
    const { data: outcomesData, error: outcomesError } = await supabaseAdmin
      .from('outcome_events')
      .select('timestamp, count')
      .eq('organization_id', orgId)
      .gte('timestamp', startParam)
      .lt('timestamp', endParam);

    if (outcomesError) throw new Error(`Failed to load outcomes: ${outcomesError.message}`);

    const byDay: Record<string, { cost: number; tokens: number; outcomes: number }> = {};

    (rawUsage || []).forEach((row: any) => {
      const day = new Date(row.timestamp).toISOString().split('T')[0];
      if (!byDay[day]) byDay[day] = { cost: 0, tokens: 0, outcomes: 0 };
      byDay[day].cost += parseFloat(row.calculated_cost || '0');
      byDay[day].tokens += (row.input_tokens || 0) + (row.output_tokens || 0) + (row.cache_read_tokens || 0) + (row.cache_creation_tokens || 0);
    });

    (outcomesData || []).forEach((row: any) => {
      const day = new Date(row.timestamp).toISOString().split('T')[0];
      if (!byDay[day]) byDay[day] = { cost: 0, tokens: 0, outcomes: 0 };
      byDay[day].outcomes += row.count;
    });

    const merged = Object.keys(byDay).sort().map(date => ({
      date,
      cost: byDay[date].cost,
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
