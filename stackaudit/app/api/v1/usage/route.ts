import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase/client';
import { getAuthOrgId, UnauthorizedError, ForbiddenError } from '../../../../lib/auth';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const MAX_PAGE = 1_000_000;
const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parsePositiveInteger(value: string | null, fallback: number): number | null {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseOptionalFilter(value: string | null, field: string): string | null | undefined {
  if (value === null || value === '' || value === 'all') return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > 255) return undefined;
  if (field === 'workloadId' && !UUID_PATTERN.test(normalized)) return undefined;
  return normalized;
}

export async function GET(req: Request) {
  try {
    const orgId = await getAuthOrgId(req);
    const { searchParams } = new URL(req.url);
    const startParam = searchParams.get('start');
    const endParam = searchParams.get('end');

    if (!startParam || !endParam) {
      return NextResponse.json({ error: 'Valid start and end parameters are required' }, { status: 400 });
    }

    const startTime = new Date(startParam);
    const endTime = new Date(endParam);
    if (!Number.isFinite(startTime.getTime()) || !Number.isFinite(endTime.getTime()) || startTime >= endTime) {
      return NextResponse.json({ error: 'Valid start and end parameters are required' }, { status: 400 });
    }
    if (endTime.getTime() - startTime.getTime() > MAX_RANGE_MS) {
      return NextResponse.json({ error: 'Usage range cannot exceed 366 days' }, { status: 400 });
    }

    const page = parsePositiveInteger(searchParams.get('page'), 1);
    const pageSize = parsePositiveInteger(searchParams.get('limit'), DEFAULT_PAGE_SIZE);
    if (page === null || page > MAX_PAGE) {
      return NextResponse.json({ error: `Page must be an integer between 1 and ${MAX_PAGE}` }, { status: 400 });
    }
    if (pageSize === null || pageSize > MAX_PAGE_SIZE) {
      return NextResponse.json({ error: `Limit must be an integer between 1 and ${MAX_PAGE_SIZE}` }, { status: 400 });
    }

    const provider = parseOptionalFilter(searchParams.get('provider'), 'provider');
    const model = parseOptionalFilter(searchParams.get('model'), 'model');
    const workloadId = parseOptionalFilter(searchParams.get('workloadId'), 'workloadId');
    if (provider === undefined || model === undefined || workloadId === undefined) {
      return NextResponse.json({ error: 'Invalid provider, model, or workloadId filter' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc('aggregate_usage_page', {
      p_organization_id: orgId,
      p_start_time: startTime.toISOString(),
      p_end_time: endTime.toISOString(),
      p_provider: provider,
      p_model: model,
      p_workload_id: workloadId,
      p_page: page,
      p_page_size: pageSize
    });

    if (error) throw new Error(`Failed to load usage: ${error.message}`);
    if (!data || typeof data !== 'object') throw new Error('Usage aggregation returned no result');
    return NextResponse.json(data, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error('Usage API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
