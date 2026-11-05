import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase/client';
import { getAuthOrgId, UnauthorizedError, ForbiddenError } from '../../../../lib/auth';
import { OutcomeService } from '../../../../core/outcomes/service';
import { WorkloadNotFoundError, ValidationError } from '../../../../core/workloads/service';
import { ConflictError } from '../../../../core/types';

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
    if (error instanceof ConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
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
    const startTime = new Date(start);
    const endTime = new Date(end);
    if (endTime.getTime() - startTime.getTime() > 366 * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: 'Outcome range cannot exceed 366 days' }, { status: 400 });
    }
    const data = await outcomeService.getCostPerOutcomeSummaries(orgId, startTime, endTime);
    return NextResponse.json({ data });
  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof ValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof WorkloadNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    console.error('Outcomes GET Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
