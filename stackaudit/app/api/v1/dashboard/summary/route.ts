import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase/client';
import { getAuthOrgId, UnauthorizedError, ForbiddenError } from '../../../../../lib/auth';
import { OutcomeService } from '../../../../../core/outcomes/service';

export async function GET(req: Request) {
  try {
    const orgId = await getAuthOrgId(req);
    const url = new URL(req.url);
    const startParam = url.searchParams.get('start');
    const endParam = url.searchParams.get('end');

    if (!startParam || !endParam) {
      return NextResponse.json({ error: 'Missing start or end parameters' }, { status: 400 });
    }

    const startTime = new Date(startParam);
    const endTime = new Date(endParam);

    // 1. Total Cost & Usage
    const { data: usageData, error: usageError } = await supabaseAdmin.rpc('aggregate_dashboard_metrics', {
      p_organization_id: orgId,
      p_start_time: startTime.toISOString(),
      p_end_time: endTime.toISOString()
    });

    if (usageError) throw new Error(`Failed to load usage: ${usageError.message}`);

    const usageRow = usageData?.[0] || {};
    const totalCost = parseFloat(usageRow.total_cost || '0');
    const totalTokens = parseFloat(usageRow.total_tokens || '0');
    const totalRequests = parseInt(usageRow.request_count || '0', 10);

    // 2. Active Alerts Count
    const { count: alertsCount, error: alertsError } = await supabaseAdmin
      .from('alerts')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('status', 'OPEN');

    if (alertsError) throw new Error(`Failed to load alerts: ${alertsError.message}`);

    // 3. Outcomes & Cost Per Outcome
    const { data: outcomesData, error: outcomesError } = await supabaseAdmin
      .from('outcome_events')
      .select('outcome_type, count')
      .eq('organization_id', orgId)
      .gte('timestamp', startTime.toISOString())
      .lt('timestamp', endTime.toISOString());

    if (outcomesError) throw new Error(`Failed to load outcomes: ${outcomesError.message}`);

    // Group by outcome type
    const outcomeCounts = (outcomesData || []).reduce((acc: Record<string, number>, curr) => {
      acc[curr.outcome_type] = (acc[curr.outcome_type] || 0) + curr.count;
      return acc;
    }, {});

    const outcomeTypes = Object.keys(outcomeCounts);
    let totalOutcomes = 0;
    let primaryCpo = null;

    if (outcomeTypes.length === 1) {
      const type = outcomeTypes[0];
      totalOutcomes = outcomeCounts[type];
      primaryCpo = {
        outcomeType: type,
        // Since this is across multiple workloads, we can't reliably divide totalCost by totalOutcomes
        // without risking the C6 bug (unallocated cost skewing CPO).
        // The dashboard must explicitly show this is an aggregated metric or leave costPerOutcome null.
        costPerOutcome: totalOutcomes > 0 ? (totalCost / totalOutcomes).toFixed(4) : null,
        note: 'Aggregated CPO across all workloads. May include unallocated costs.'
      };
    } else if (outcomeTypes.length > 1) {
      totalOutcomes = outcomeTypes.reduce((sum, type) => sum + outcomeCounts[type], 0);
      primaryCpo = {
        outcomeType: 'Multiple',
        costPerOutcome: null,
        note: 'Multiple outcome types exist. Please view Workloads or Outcomes for specific metrics.'
      };
    }

    return NextResponse.json({
      totalCost,
      totalTokens,
      totalRequests,
      activeAlerts: alertsCount || 0,
      outcomes: {
        totalCount: totalOutcomes,
        primaryCpo
      },
      timeWindow: {
        start: startTime.toISOString(),
        end: endTime.toISOString()
      }
    }, { status: 200 });

  } catch (error: any) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error('Dashboard Summary Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
