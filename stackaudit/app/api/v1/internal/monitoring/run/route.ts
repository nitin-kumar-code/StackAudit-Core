import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../../lib/supabase/client';
import { MonitoringService } from '../../../../../../core/monitoring/monitoring-service';

const monitoringService = new MonitoringService(supabaseAdmin);

/**
 * Internal cron endpoint. Authenticated by CRON_SECRET header, NOT a user JWT.
 * Runs monitoring across ALL enabled configs (all orgs).
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
    const token = authHeader?.replace('Bearer ', '').trim();

    if (!token || token !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Cron path: run across ALL orgs
    const runIds = await monitoringService.runMonitoringAllOrgs();

    const { data: runs } = await supabaseAdmin
      .from('monitoring_runs')
      .select('*')
      .in('id', runIds);

    return NextResponse.json({ runs: runs || [], count: runIds.length }, { status: 200 });
  } catch (error: any) {
    console.error('Internal Monitoring Run Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
