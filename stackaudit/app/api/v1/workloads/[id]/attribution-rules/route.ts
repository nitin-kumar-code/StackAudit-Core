import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../../lib/supabase/client';
import { WorkloadService, WorkloadNotFoundError, ValidationError } from '../../../../../../core/workloads/service';
import { getAuthOrgId, UnauthorizedError, ForbiddenError } from '../../../../../../lib/auth';

const workloadService = new WorkloadService(supabaseAdmin);

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const orgId = await getAuthOrgId(req);
    const rules = await workloadService.listAttributionRules(orgId, id);
    return NextResponse.json({ data: rules });
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
    console.error('Attribution Rules GET Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const orgId = await getAuthOrgId(req);
    const body = await req.json();

    const allowedKeys = ['provider', 'matchType', 'matchValue'];
    for (const key of Object.keys(body)) {
      if (!allowedKeys.includes(key)) {
        return NextResponse.json({ error: `Unknown field: ${key}` }, { status: 400 });
      }
    }
    if (typeof body.provider !== 'string' || body.provider.length > 255) {
      return NextResponse.json({ error: 'provider must be a string up to 255 characters' }, { status: 400 });
    }
    if (typeof body.matchType !== 'string' || body.matchType.length > 255) {
      return NextResponse.json({ error: 'matchType must be a string up to 255 characters' }, { status: 400 });
    }
    if (typeof body.matchValue !== 'string' || body.matchValue.length > 255) {
      return NextResponse.json({ error: 'matchValue must be a string up to 255 characters' }, { status: 400 });
    }

    const rule = await workloadService.createAttributionRule(orgId, id, {
      provider: body.provider,
      matchType: body.matchType,
      matchValue: body.matchValue
    });
    return NextResponse.json({ data: rule }, { status: 201 });
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
    console.error('Attribution Rules POST Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
