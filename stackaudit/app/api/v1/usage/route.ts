import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase/client';
import { getAuthOrgId, UnauthorizedError, ForbiddenError } from '../../../../lib/auth';

export async function GET(req: Request) {
  try {
    const orgId = await getAuthOrgId(req);
    const url = new URL(req.url);
    const startParam = url.searchParams.get('start');
    const endParam = url.searchParams.get('end');
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const lastId = url.searchParams.get('lastId');

    if (!startParam || !endParam) {
      return NextResponse.json({ error: 'Missing start or end parameters' }, { status: 400 });
    }

    let query = supabaseAdmin
      .from('v_attributed_usage_events')
      .select('*')
      .eq('organization_id', orgId)
      .gte('timestamp', startParam)
      .lt('timestamp', endParam)
      .order('id', { ascending: false })
      .limit(limit);

    if (lastId) {
      query = query.lt('id', lastId); // keyset pagination based on id
    }

    const { data: usageData, error: usageError } = await query;

    if (usageError) throw new Error(`Failed to load usage: ${usageError.message}`);

    return NextResponse.json({ events: usageData }, { status: 200 });
  } catch (error: any) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error('Usage API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
