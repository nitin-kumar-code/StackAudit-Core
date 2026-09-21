import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../../../lib/supabase/client';
import { WorkloadService, WorkloadNotFoundError } from '../../../../../../../core/workloads/service';
import { getAuthOrgId, UnauthorizedError, ForbiddenError } from '../../../../../../../lib/auth';

const workloadService = new WorkloadService(supabaseAdmin);

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string, ruleId: string }> }
) {
  try {
    const { id, ruleId } = await params;
    const orgId = await getAuthOrgId(req);
    await workloadService.deleteAttributionRule(orgId, id, ruleId);
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof WorkloadNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error('Attribution Rule DELETE Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
