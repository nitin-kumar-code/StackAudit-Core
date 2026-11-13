import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../../lib/supabase/client';
import { MonitoringService } from '../../../../../../core/monitoring/monitoring-service';
import { ConfigurationError, getValidatedWorkspaceId } from '../../../../../../lib/auth';

const monitoringService = new MonitoringService(supabaseAdmin);

/**
 * Internal cron endpoint. Authenticated by CRON_SECRET header, NOT a user JWT.
 * Runs monitoring for the explicitly configured local workspace.
 *
 * Example cron invocation:
 *   curl -X POST https://your-domain/api/v1/internal/monitoring/run \
 *     -H "Authorization: Bearer $CRON_SECRET"
 */
export async function POST(req: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error('CRON_SECRET env var is not set. Internal monitoring endpoint is disabled.');
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
    }

    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tokenBuf = Buffer.from(token);
    const secretBuf = Buffer.from(cronSecret);
    if (tokenBuf.length !== secretBuf.length || !crypto.timingSafeEqual(tokenBuf, secretBuf)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = await getValidatedWorkspaceId();

    // Prevent caller from attempting cross-organization execution via query parameters
    const url = new URL(req.url);
    const requestedOrg = url.searchParams.get('organization_id') || url.searchParams.get('org_id') || url.searchParams.get('orgId');
    if (requestedOrg && requestedOrg !== workspaceId) {
      return NextResponse.json(
        { error: 'Forbidden: Cannot target arbitrary organization in single-workspace V0 deployment.' },
        { status: 403 }
      );
    }

    const runId = await monitoringService.runMonitoring(workspaceId);
    const runIds = [runId];

    const { data: runs } = await supabaseAdmin
      .from('monitoring_runs')
      .select('*')
      .eq('organization_id', workspaceId)
      .in('id', runIds);

    return NextResponse.json({ runs: runs || [], count: runIds.length }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof ConfigurationError) return NextResponse.json({ error: error.message }, { status: 503 });
    console.error('Internal Monitoring Run Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
