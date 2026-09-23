import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase/client';
import { getAuthOrgId, UnauthorizedError, ForbiddenError } from '../../../../lib/auth';

export async function GET(req: Request) {
  try {
    const orgId = await getAuthOrgId(req);
    const { searchParams } = new URL(req.url);
    const workloadId = searchParams.get('workloadId');
    const status = searchParams.get('status');
    const severity = searchParams.get('severity');

    let query = supabaseAdmin.from('alerts').select('*').eq('organization_id', orgId).order('created_at', { ascending: false });

    if (workloadId) query = query.eq('workload_id', workloadId);
    if (status) query = query.eq('status', status);
    if (severity) query = query.eq('severity', severity);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ alerts: data }, { status: 200 });
  } catch (error: any) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error('Alerts GET Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
