import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase/client';
import { getAuthOrgId, UnauthorizedError, ForbiddenError } from '../../../../../lib/auth';
import { calculateCostPerOutcome, UsageCostSummary } from '../../../../../core/usage/metrics';

interface DashboardWorkloadAggregate {
  id: string;
  name: string;
  knownCost: string | null;
  cost: string | null;
  isCostComplete: boolean;
  pricedEventCount: number;
  unpricedEventCount: number;
  eventCount: number;
  usage: number;
  totalRequests: number;
  outcomes: number;
  outcomeTypes: Record<string, number>;
}

interface DashboardSummaryAggregate {
  summary: {
    totalCost: string | null;
    knownCost: string | null;
    isCostComplete: boolean;
    pricedEventCount: number;
    unpricedEventCount: number;
    totalTokens: number;
    totalRequests: number;
    totalOutcomes: number;
    attributedCost: string | null;
    attributedKnownCost: string | null;
    unattributedCost: string | null;
    unattributedKnownCost: string | null;
    unattributedIsCostComplete: boolean;
    unattributedEventCount: number;
  };
  workloads: DashboardWorkloadAggregate[];
  unattributed: {
    knownCost: string | null;
    cost: string | null;
    isCostComplete: boolean;
    pricedEventCount: number;
    unpricedEventCount: number;
    eventCount: number;
    usage: number;
    totalRequests: number;
  };
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
    if (!Number.isFinite(startTime.getTime()) || !Number.isFinite(endTime.getTime()) || startTime >= endTime) {
      return NextResponse.json({ error: 'Valid start and end parameters are required' }, { status: 400 });
    }
    if (endTime.getTime() - startTime.getTime() > 366 * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: 'Dashboard range cannot exceed 366 days' }, { status: 400 });
    }

    const start = startTime.toISOString();
    const end = endTime.toISOString();
    const [aggregateResult, alertsResult, findingsResult] = await Promise.all([
      supabaseAdmin.rpc('aggregate_dashboard_summary', {
        p_organization_id: orgId,
        p_start_time: start,
        p_end_time: end
      }),
      supabaseAdmin.from('alerts')
        .select('*, audit_findings(*)', { count: 'exact' })
        .eq('organization_id', orgId)
        .eq('status', 'OPEN')
        .order('created_at', { ascending: false })
        .limit(3),
      supabaseAdmin.from('audit_findings')
        .select('*')
        .eq('organization_id', orgId)
        .eq('status', 'OPEN')
        .order('created_at', { ascending: false })
        .limit(3)
    ]);

    if (aggregateResult.error) throw new Error(`Failed to aggregate dashboard: ${aggregateResult.error.message}`);
    if (alertsResult.error) throw new Error(`Failed to load dashboard alerts: ${alertsResult.error.message}`);
    if (findingsResult.error) throw new Error(`Failed to load dashboard findings: ${findingsResult.error.message}`);
    if (!aggregateResult.data || typeof aggregateResult.data !== 'object') {
      throw new Error('Dashboard aggregation returned no result');
    }

    const aggregate = aggregateResult.data as DashboardSummaryAggregate;
    const workloadById = new Map(aggregate.workloads.map(workload => [workload.id, workload.name]));
    const workloadSummaries = aggregate.workloads.map(workload => {
      const costSummary: UsageCostSummary = {
        knownCost: workload.knownCost,
        totalCost: workload.cost,
        isComplete: workload.isCostComplete,
        pricedEventCount: workload.pricedEventCount,
        unpricedEventCount: workload.unpricedEventCount
      };
      const outcomeTypes = Object.keys(workload.outcomeTypes || {});
      const costPerOutcome = outcomeTypes.length === 1
        ? calculateCostPerOutcome(costSummary, workload.outcomes).value
        : null;

      return {
        id: workload.id,
        name: workload.name,
        cost: workload.cost,
        knownCost: workload.knownCost,
        isCostComplete: workload.isCostComplete,
        unpricedEventCount: workload.unpricedEventCount,
        usage: workload.usage,
        outcomes: workload.outcomes,
        costPerOutcome,
        changePct: null
      };
    });

    const recentAlerts = (alertsResult.data || []).map(alert => ({
      id: alert.id,
      category: alert.category,
      severity: alert.severity,
      workloadId: alert.workload_id,
      workloadName: workloadById.get(alert.workload_id) || 'Unknown',
      finding: alert.audit_findings ? {
        title: alert.audit_findings.title,
        description: alert.audit_findings.description,
        evidence: alert.audit_findings.evidence
      } : null
    }));

    const costChangeEvidence = (findingsResult.data || []).map(finding => ({
      workloadId: finding.workload_id,
      workloadName: workloadById.get(finding.workload_id) || 'Unknown',
      title: finding.title,
      evidence: finding.evidence
    }));

    return NextResponse.json({
      ...aggregate.summary,
      activeAlerts: alertsResult.count ?? alertsResult.data?.length ?? 0,
      outcomes: {
        totalCount: aggregate.summary.totalOutcomes,
        primaryCpo: {
          costPerOutcome: null,
          availabilityReason: 'Organization-wide cost per outcome is unavailable because organization cost cannot be matched to a single workload and outcome type.'
        }
      },
      workloadSummaries,
      recentAlerts,
      costChangeEvidence,
      timeWindow: { start, end }
    }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error('Dashboard Summary Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal Server Error' }, { status: 500 });
  }
}
