import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase/client';
import { WorkloadService, ValidationError } from '../../../../core/workloads/service';
import { getAuthOrgId, UnauthorizedError, ForbiddenError } from '../../../../lib/auth';

const workloadService = new WorkloadService(supabaseAdmin);

export async function GET(req: Request) {
  try {
    const orgId = await getAuthOrgId(req);
    const workloads = await workloadService.listWorkloads(orgId);
    return NextResponse.json({ workloads });
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Workloads GET Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const orgId = await getAuthOrgId(req);
    const body = await req.json();

    const workload = await workloadService.createWorkload({
      organizationId: orgId,
      name: body.name,
      description: body.description
    });
    
    return NextResponse.json({ data: workload }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Workloads POST Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
