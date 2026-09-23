import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../../lib/supabase/client';
import { getAuthOrgId, UnauthorizedError, ForbiddenError } from '../../../../../../lib/auth';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const orgId = await getAuthOrgId(req);
    const { id } = await params;

    const { data, error } = await supabaseAdmin
      .from('alerts')
      .update({ status: 'ACKNOWLEDGED' })
      .eq('id', id)
      .eq('organization_id', orgId)
      .in('status', ['OPEN'])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Alert not found or cannot be acknowledged' }, { status: 404 });
    }

    return NextResponse.json({ alert: data }, { status: 200 });
  } catch (error: any) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error('Alert Acknowledge Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
