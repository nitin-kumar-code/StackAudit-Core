import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase/client';
import { getAuthOrgId, UnauthorizedError, ForbiddenError } from '../../../../lib/auth';
import { AuditService } from '../../../../core/audit/service';
import { WorkloadNotFoundError, ValidationError } from '../../../../core/workloads/service';

const auditService = new AuditService(supabaseAdmin);

export async function POST(req: Request) {
  try {
    const orgId = await getAuthOrgId(req);
    const body = await req.json();

    if (!body.workloadId || !body.start || !body.end) {
      return NextResponse.json({ error: 'Missing required fields: workloadId, start, end' }, { status: 400 });
    }

    const start = new Date(body.start);
    const end = new Date(body.end);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json({ error: 'Invalid date formats for start or end' }, { status: 400 });
    }

    const findings = await auditService.runAudit(orgId, {
      workloadId: body.workloadId,
      start,
      end
    });

    return NextResponse.json({
      window: { start: start.toISOString(), end: end.toISOString() },
      findings
    }, { status: 200 });

  } catch (error: any) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof ValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof WorkloadNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    
    console.error('Audit POST Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
