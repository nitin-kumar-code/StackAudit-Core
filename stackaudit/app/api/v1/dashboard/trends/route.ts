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

    // Call the RPC that calculates daily cost and tokens
    const { data: trendsData, error: trendsError } = await supabaseAdmin.rpc('aggregate_dashboard_trends', {
      p_organization_id: orgId,
      p_start_time: startParam,
      p_end_time: endParam
    });

    if (trendsError) throw new Error(`Failed to load trends: ${trendsError.message}`);

    // Call outcome_events directly for daily outcome sums
    const { data: outcomesData, error: outcomesError } = await supabaseAdmin
      .from('outcome_events')
      .select('timestamp, count')
      .eq('organization_id', orgId)
      .gte('timestamp', startParam)
      .lt('timestamp', endParam);

    if (outcomesError) throw new Error(`Failed to load outcomes: ${outcomesError.message}`);

    // Bucket outcomes by day locally to merge with the RPC response
    const outcomeByDay = (outcomesData || []).reduce((acc: Record<string, number>, row) => {
      // truncate to day (YYYY-MM-DD)
      const day = new Date(row.timestamp).toISOString().split('T')[0];
      acc[day] = (acc[day] || 0) + row.count;
      return acc;
    }, {});

    const merged = (trendsData || []).map((row: any) => {
      const day = new Date(row.period_start).toISOString().split('T')[0];
      return {
        date: day,
        cost: parseFloat(row.total_cost || '0'),
        tokens: parseFloat(row.total_tokens || '0'),
        outcomes: outcomeByDay[day] || 0
      };
    });

    return NextResponse.json(merged, { status: 200 });
  } catch (error: any) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error('Dashboard Trends Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
