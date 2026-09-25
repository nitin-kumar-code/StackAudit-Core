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

    // 1. Fetch foundational records
    const [
      { data: workloads },
      { data: rules },
      { data: rawUsage },
      { data: outcomesData }
    ] = await Promise.all([
      supabaseAdmin.from('workloads').select('id, name').eq('organization_id', orgId),
      supabaseAdmin.from('attribution_rules').select('workload_id, match_value').eq('organization_id', orgId),
      supabaseAdmin.from('usage_events')
        .select('calculated_cost, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, request_count, api_key_id')
        .eq('organization_id', orgId)
        .gte('timestamp', startTime.toISOString())
        .lt('timestamp', endTime.toISOString()),
      supabaseAdmin.from('outcome_events')
        .select('workload_id, outcome_type, count')
        .in('workload_id', [orgId]) // Workaround for remote schema query
    ]);
    
    // Fallback: we should fetch outcome_events sequentially so we can use the workload IDs.
    const workloadIds = (workloads || []).map(w => w.id);
    const { data: realOutcomes } = await supabaseAdmin.from('outcome_events')
      .select('workload_id, outcome_type, count')
      .in('workload_id', workloadIds.length ? workloadIds : ['00000000-0000-0000-0000-000000000000'])
      .gte('timestamp', startTime.toISOString())
      .lt('timestamp', endTime.toISOString());

    const { data: realAlerts } = await supabaseAdmin.from('alerts')
      .select('*, audit_findings(*)')
      .eq('organization_id', orgId)
      .eq('status', 'OPEN')
      .order('created_at', { ascending: false });

    // Map api_key -> workload_id
    const keyToWorkload = (rules || []).reduce((acc: any, curr) => {
      acc[curr.match_value] = curr.workload_id;
      return acc;
    }, {});

    // Aggregations
    let totalCostNum = 0;
    let totalTokensNum = 0;
    let requestCountNum = 0;
    
    const workloadAgg: Record<string, { cost: number; usage: number; outcomes: number; name: string }> = {};
    (workloads || []).forEach(w => {
      workloadAgg[w.id] = { cost: 0, usage: 0, outcomes: 0, name: w.name };
    });

    // Process Usage
    (rawUsage || []).forEach(row => {
      const cost = parseFloat(row.calculated_cost || '0');
      const tokens = (row.input_tokens || 0) + (row.output_tokens || 0) + (row.cache_read_tokens || 0) + (row.cache_creation_tokens || 0);
      
      totalCostNum += cost;
      totalTokensNum += tokens;
      requestCountNum += (row.request_count || 0);
      
      const wId = row.api_key_id ? keyToWorkload[row.api_key_id] : null;
      if (wId && workloadAgg[wId]) {
        workloadAgg[wId].cost += cost;
        workloadAgg[wId].usage += tokens;
      }
    });

    // Process Outcomes
    let totalOutcomes = 0;
    const outcomeCounts: Record<string, number> = {};
    
    (realOutcomes || []).forEach(row => {
      totalOutcomes += row.count;
      outcomeCounts[row.outcome_type] = (outcomeCounts[row.outcome_type] || 0) + row.count;
      if (row.workload_id && workloadAgg[row.workload_id]) {
        workloadAgg[row.workload_id].outcomes += row.count;
      }
    });

    // Cost Per Outcome Top Level
    const outcomeTypes = Object.keys(outcomeCounts);
    let primaryCpo = null;
    if (outcomeTypes.length === 1) {
      primaryCpo = {
        outcomeType: outcomeTypes[0],
        costPerOutcome: totalOutcomes > 0 ? (totalCostNum / totalOutcomes).toFixed(4) : null,
        note: 'Aggregated CPO across all workloads.'
      };
    } else if (outcomeTypes.length > 1) {
      primaryCpo = {
        outcomeType: 'Multiple',
        costPerOutcome: null,
        note: 'Multiple outcome types exist. Please view Workloads for specific metrics.'
      };
    }

    // Format Workload Summaries
    const workloadSummaries = Object.entries(workloadAgg).map(([id, agg]) => ({
      id,
      name: agg.name,
      cost: agg.cost,
      usage: agg.usage,
      outcomes: agg.outcomes,
      costPerOutcome: agg.outcomes > 0 ? agg.cost / agg.outcomes : null,
      changePct: null
    })).sort((a, b) => b.cost - a.cost);

    // Format Alerts & Evidence
    const recentAlerts = (realAlerts || []).slice(0, 3).map(a => ({
      id: a.id,
      category: a.category,
      severity: a.severity,
      workloadId: a.workload_id,
      workloadName: workloadAgg[a.workload_id]?.name || 'Unknown',
      finding: a.audit_findings ? {
        title: a.audit_findings.title,
        description: a.audit_findings.description,
        evidence: a.audit_findings.evidence
      } : null
    }));
    
    const activeAlertsCount = realAlerts?.length || 0;

    // Grab open findings for "Why Costs Changed"
    const { data: openFindings } = await supabaseAdmin.from('audit_findings')
      .select('*')
      .eq('organization_id', orgId)
      .eq('status', 'OPEN')
      .order('created_at', { ascending: false })
      .limit(3);

    const costChangeEvidence = (openFindings || []).map(f => ({
      workloadId: f.workload_id,
      workloadName: workloadAgg[f.workload_id]?.name || 'Unknown',
      title: f.title,
      evidence: f.evidence
    }));

    return NextResponse.json({
      totalCost: totalCostNum,
      totalTokens: totalTokensNum,
      totalRequests: requestCountNum,
      activeAlerts: activeAlertsCount,
      outcomes: {
        totalCount: totalOutcomes,
        primaryCpo
      },
      workloadSummaries,
      recentAlerts,
      costChangeEvidence,
      timeWindow: {
        start: startTime.toISOString(),
        end: endTime.toISOString()
      }
    }, { status: 200 });

  } catch (error: any) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error('Dashboard Summary Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
