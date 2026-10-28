import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase/client';
import { getAuthOrgId, UnauthorizedError, ForbiddenError } from '../../../../lib/auth';
import { OutcomeService } from '../../../../core/outcomes/service';
import { WorkloadNotFoundError, ValidationError } from '../../../../core/workloads/service';

const outcomeService = new OutcomeService(supabaseAdmin);

export async function POST(req: Request) {
  try {
    const orgId = await getAuthOrgId(req);
    const body = await req.json();

    // Boundary Validation
    const allowedKeys = ['workloadId', 'outcomeType', 'timestamp', 'count', 'metadata', 'idempotencyKey'];
    for (const key of Object.keys(body)) {
      if (!allowedKeys.includes(key)) {
        return NextResponse.json({ error: `Unknown field: ${key}` }, { status: 400 });
      }
    }

    const { event, isDuplicate } = await outcomeService.createOutcome(orgId, {
      workloadId: body.workloadId,
      outcomeType: body.outcomeType,
      timestamp: new Date(body.timestamp),
      count: body.count,
      metadata: body.metadata,
      idempotencyKey: body.idempotencyKey
    });
    
    // Status 201 for Created, 200 for Idempotent match returning existing record
    return NextResponse.json({ data: event, isDuplicate }, { status: isDuplicate ? 200 : 201 });
  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof WorkloadNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    
    console.error('Outcomes POST Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const orgId = await getAuthOrgId(req);
    const { searchParams } = new URL(req.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    if (!start || !end || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(start) >= Date.parse(end)) {
      return NextResponse.json({ error: 'Valid start and end parameters are required' }, { status: 400 });
    }
    const { data: workloads, error: workloadError } = await supabaseAdmin.from('workloads').select('id, name').eq('organization_id', orgId);
    if (workloadError) throw workloadError;
    const ids = (workloads || []).map(w => w.id);
    if (!ids.length) return NextResponse.json({ data: [] });
    const { data: outcomes, error } = await supabaseAdmin.from('outcome_events').select('workload_id, outcome_type, count')
      .in('workload_id', ids).gte('timestamp', start).lt('timestamp', end);
    if (error) throw error;
    const groups = new Map<string, { workloadId: string; outcomeType: string; count: number }>();
    for (const row of outcomes || []) {
      const key = `${row.workload_id}:${row.outcome_type}`;
      const group = groups.get(key) || { workloadId: row.workload_id, outcomeType: row.outcome_type, count: 0 };
      group.count += Number(row.count);
      groups.set(key, group);
    }
    const names = new Map((workloads || []).map(w => [w.id, w.name]));
    const data = await Promise.all([...groups.values()].map(async group => {
      const result = await outcomeService.getCostPerOutcome(orgId, group.workloadId, group.outcomeType, new Date(start), new Date(end));
      return { ...result, workloadName: names.get(group.workloadId), totalOutcomeCount: group.count };
    }));
    return NextResponse.json({ data });
  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error('Outcomes GET Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
