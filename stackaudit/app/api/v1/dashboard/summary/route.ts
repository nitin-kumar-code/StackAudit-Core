import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase/client';
import { getAuthOrgId, UnauthorizedError, ForbiddenError } from '../../../../../lib/auth';
import { aggregateUsageCosts, calculateCostPerOutcome, getRequestCount, getTotalTokenCount } from '../../../../../core/usage/metrics';
import { UsageCostRow } from '../../../../../core/usage/metrics';

interface DashboardUsageRow extends UsageCostRow {
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_creation_tokens: number | null;
  request_count: number | null;
  api_key_id: string | null;
  provider: string;
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

    const startTime = new Date(startParam);
    const endTime = new Date(endParam);

    // 1. Fetch foundational records
    const [
      { data: workloads },
      { data: rules },
      { data: rawUsage }
    ] = await Promise.all([
      supabaseAdmin.from('workloads').select('id, name').eq('organization_id', orgId),
      supabaseAdmin.from('attribution_rules').select('workload_id, provider, match_type, match_value').eq('organization_id', orgId),
      supabaseAdmin.from('usage_events')
        .select('calculated_cost, is_unpriced, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, request_count, api_key_id, provider')
        .eq('organization_id', orgId)
        .gte('timestamp', startTime.toISOString())
        .lt('timestamp', endTime.toISOString()),
    ]);
    
    // Scope outcomes to workload IDs belonging to the authenticated organization.
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
    const keyToWorkload = (rules || []).reduce((acc: Record<string, string>, curr) => {
      if (curr.match_type?.toLowerCase() === 'api_key') acc[`${curr.provider}:${curr.match_value}`] = curr.workload_id;
      return acc;
    }, {});

    // Aggregations
    const costRows: DashboardUsageRow[] = [];
    const attributedCostRows: DashboardUsageRow[] = [];
    const unattributedCostRows: DashboardUsageRow[] = [];
    let totalTokensNum = 0;
    let requestCountNum = 0;
    
    const workloadAgg: Record<string, { costs: DashboardUsageRow[]; usage: number; outcomes: number; outcomeTypes: Record<string, number>; name: string }> = {};
    (workloads || []).forEach(w => {
      workloadAgg[w.id] = { costs: [], usage: 0, outcomes: 0, outcomeTypes: {}, name: w.name };
    });

    // Process Usage
    (rawUsage || []).forEach(row => {
      const tokens = getTotalTokenCount(row);
      costRows.push(row);
      totalTokensNum += tokens;
      requestCountNum += getRequestCount(row.request_count);
      
      const wId = row.api_key_id ? keyToWorkload[`${row.provider}:${row.api_key_id}`] : null;
      if (wId && workloadAgg[wId]) {
        attributedCostRows.push(row);
        workloadAgg[wId].costs.push(row);
        workloadAgg[wId].usage += tokens;
      } else unattributedCostRows.push(row);
    });

    // Process Outcomes
    let totalOutcomes = 0;
    const outcomeCounts: Record<string, number> = {};
    
    (realOutcomes || []).forEach(row => {
      totalOutcomes += Number(row.count);
      outcomeCounts[row.outcome_type] = (outcomeCounts[row.outcome_type] || 0) + Number(row.count);
      if (row.workload_id && workloadAgg[row.workload_id]) {
        workloadAgg[row.workload_id].outcomes += Number(row.count);
        workloadAgg[row.workload_id].outcomeTypes[row.outcome_type] = (workloadAgg[row.workload_id].outcomeTypes[row.outcome_type] || 0) + Number(row.count);
      }
    });

    const totalCosts = aggregateUsageCosts(costRows);
    const attributedCosts = aggregateUsageCosts(attributedCostRows);
    const unattributedCosts = aggregateUsageCosts(unattributedCostRows);

    // Format Workload Summaries
    const workloadSummaries = Object.entries(workloadAgg).map(([id, agg]) => ({
      id,
      name: agg.name,
      cost: aggregateUsageCosts(agg.costs).totalCost,
      knownCost: aggregateUsageCosts(agg.costs).knownCost,
      isCostComplete: aggregateUsageCosts(agg.costs).isComplete,
      unpricedEventCount: aggregateUsageCosts(agg.costs).unpricedEventCount,
      usage: agg.usage,
      outcomes: agg.outcomes,
      costPerOutcome: Object.keys(agg.outcomeTypes).length === 1 ? calculateCostPerOutcome(aggregateUsageCosts(agg.costs), agg.outcomes).value : null,
      changePct: null
    })).sort((a, b) => Number(b.knownCost || 0) - Number(a.knownCost || 0));

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
      totalCost: totalCosts.totalCost,
      knownCost: totalCosts.knownCost,
      isCostComplete: totalCosts.isComplete,
      pricedEventCount: totalCosts.pricedEventCount,
      unpricedEventCount: totalCosts.unpricedEventCount,
      attributedCost: attributedCosts.totalCost,
      attributedKnownCost: attributedCosts.knownCost,
      unattributedCost: unattributedCosts.totalCost,
      unattributedKnownCost: unattributedCosts.knownCost,
      unattributedIsCostComplete: unattributedCosts.isComplete,
      unattributedEventCount: unattributedCostRows.length,
      totalTokens: totalTokensNum,
      totalRequests: requestCountNum,
      activeAlerts: activeAlertsCount,
      outcomes: {
        totalCount: totalOutcomes,
        primaryCpo: { costPerOutcome: null, availabilityReason: 'Organization-wide cost per outcome is unavailable because organization cost cannot be matched to a single workload and outcome type.' }
      },
      workloadSummaries,
      recentAlerts,
      costChangeEvidence,
      timeWindow: {
        start: startTime.toISOString(),
        end: endTime.toISOString()
      }
    }, { status: 200 });

  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error('Dashboard Summary Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal Server Error' }, { status: 500 });
  }
}
