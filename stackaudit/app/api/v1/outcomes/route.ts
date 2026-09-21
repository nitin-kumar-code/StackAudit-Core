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
  } catch (error: any) {
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
