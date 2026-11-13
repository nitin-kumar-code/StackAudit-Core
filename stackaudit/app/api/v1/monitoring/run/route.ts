import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase/client';
import { getAuthOrgId, UnauthorizedError, ForbiddenError } from '../../../../../lib/auth';
import { MonitoringService } from '../../../../../core/monitoring/monitoring-service';
import { rateLimit } from '../../../../../lib/rate-limit';

const monitoringService = new MonitoringService(supabaseAdmin);

export async function POST(req: Request) {
  try {
    const orgId = await getAuthOrgId(req);

    // Rate limit: 5 requests per org per minute
    if (!rateLimit(`monitoring:${orgId}`, 5, 5 / 60)) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429 });
    }

    // User-facing route: always scoped to the authenticated org
    const runId = await monitoringService.runMonitoring(orgId);

    const { data: runData } = await supabaseAdmin
      .from('monitoring_runs')
      .select('*')
      .eq('id', runId)
      .eq('organization_id', orgId)
      .single();

    return NextResponse.json(runData, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error('Monitoring Run Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
