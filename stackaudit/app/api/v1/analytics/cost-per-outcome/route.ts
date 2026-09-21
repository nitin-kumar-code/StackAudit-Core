import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase/client';
import { getAuthOrgId, UnauthorizedError, ForbiddenError } from '../../../../../lib/auth';
import { OutcomeService } from '../../../../../core/outcomes/service';

const outcomeService = new OutcomeService(supabaseAdmin);

export async function GET(req: Request) {
  try {
    const orgId = await getAuthOrgId(req);
    const { searchParams } = new URL(req.url);

    const workloadId = searchParams.get('workloadId');
    const outcomeType = searchParams.get('outcomeType');
    const startTimeStr = searchParams.get('startTime');
    const endTimeStr = searchParams.get('endTime');
    const series = searchParams.get('series') === 'true';

    if (!workloadId || !outcomeType || !startTimeStr || !endTimeStr) {
      return NextResponse.json({ error: 'Missing required query parameters: workloadId, outcomeType, startTime, endTime' }, { status: 400 });
    }

    const startTime = new Date(startTimeStr);
    const endTime = new Date(endTimeStr);

    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      return NextResponse.json({ error: 'Invalid date formats for startTime or endTime' }, { status: 400 });
    }

    if (series) {
      const data = await outcomeService.getCostPerOutcomeSeries(orgId, workloadId, outcomeType, startTime, endTime);
      return NextResponse.json({ data });
    } else {
      const data = await outcomeService.getCostPerOutcome(orgId, workloadId, outcomeType, startTime, endTime);
      return NextResponse.json({ data });
    }
  } catch (error: any) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    
    console.error('Analytics GET Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
