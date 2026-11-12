import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase/client';
import { getAuthOrgId, UnauthorizedError, ForbiddenError } from '../../../../lib/auth';

const ALLOWED_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'];
const ALLOWED_SEVERITIES = ['INFO', 'LOW', 'MEDIUM', 'HIGH'];
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  try {
    const orgId = await getAuthOrgId(req);
    const { searchParams } = new URL(req.url);
    const workloadId = searchParams.get('workloadId');
    const status = searchParams.get('status');
    const severity = searchParams.get('severity');
    const limitParam = searchParams.get('limit');

    let limit = 50;
    if (limitParam !== null) {
      if (!/^\d+$/.test(limitParam) || parseInt(limitParam, 10) < 1) {
        return NextResponse.json(
          { error: 'Invalid limit parameter. Must be a positive integer between 1 and 100.' },
          { status: 400 }
        );
      }
      limit = Math.min(Math.max(1, parseInt(limitParam, 10)), 100);
    }

    if (status) {
      if (!ALLOWED_STATUSES.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status filter '${status}'. Allowed values: ${ALLOWED_STATUSES.join(', ')}` },
          { status: 400 }
        );
      }
    }

    if (severity) {
      if (!ALLOWED_SEVERITIES.includes(severity)) {
        return NextResponse.json(
          { error: `Invalid severity filter '${severity}'. Allowed values: ${ALLOWED_SEVERITIES.join(', ')}` },
          { status: 400 }
        );
      }
    }

    if (workloadId) {
      if (!UUID_REGEX.test(workloadId)) {
        return NextResponse.json(
          { error: `Invalid workloadId parameter '${workloadId}'. Must be a valid UUID.` },
          { status: 400 }
        );
      }
    }

    let query = supabaseAdmin
      .from('alerts')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (workloadId) query = query.eq('workload_id', workloadId);
    if (status) query = query.eq('status', status);
    if (severity) query = query.eq('severity', severity);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ alerts: data }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error('Alerts GET Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
