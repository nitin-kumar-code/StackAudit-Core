import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase/client';
import { WorkloadService, WorkloadNotFoundError, ValidationError } from '../../../../../core/workloads/service';
import { getAuthOrgId, UnauthorizedError, ForbiddenError } from '../../../../../lib/auth';

const workloadService = new WorkloadService(supabaseAdmin);

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const orgId = await getAuthOrgId(req);
    const workload = await workloadService.getWorkload(orgId, id);
    return NextResponse.json({ workload });
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof WorkloadNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error('Workload GET Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const orgId = await getAuthOrgId(req);
    const body = await req.json();

    // Strict validation of input
    const allowedKeys = ['name', 'description'];
    for (const key of Object.keys(body)) {
      if (!allowedKeys.includes(key)) {
        return NextResponse.json({ error: `Unknown field: ${key}` }, { status: 400 });
      }
    }
    if (body.name !== undefined && (typeof body.name !== 'string' || body.name.trim() === '')) {
      return NextResponse.json({ error: 'Name must be a non-empty string' }, { status: 400 });
    }
    if (body.description !== undefined && (typeof body.description !== 'string' && body.description !== null)) {
      return NextResponse.json({ error: 'Description must be a string or null' }, { status: 400 });
    }

    const workload = await workloadService.updateWorkload(orgId, id, {
      name: body.name,
      description: body.description
    });
    return NextResponse.json({ data: workload });
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof WorkloadNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Workload PATCH Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const orgId = await getAuthOrgId(req);
    await workloadService.deleteWorkload(orgId, id);
    return new NextResponse(null, { status: 204 });
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Workload DELETE Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
