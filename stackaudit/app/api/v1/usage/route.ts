import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase/client';
import { getAuthOrgId, UnauthorizedError, ForbiddenError } from '../../../../lib/auth';
import { aggregateUsageCosts, getRequestCount, getTotalTokenCount } from '../../../../core/usage/metrics';

export async function GET(req: Request) {
  try {
    const orgId = await getAuthOrgId(req);
    const url = new URL(req.url);
    const startParam = url.searchParams.get('start');
    const endParam = url.searchParams.get('end');
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    
    const filterProvider = url.searchParams.get('provider');
    const filterModel = url.searchParams.get('model');
    const filterWorkloadId = url.searchParams.get('workloadId');

    if (!startParam || !endParam) {
      return NextResponse.json({ error: 'Missing start or end parameters' }, { status: 400 });
    }

    // 1. Fetch relations
    const [ { data: workloads }, { data: rules } ] = await Promise.all([
      supabaseAdmin.from('workloads').select('id, name').eq('organization_id', orgId),
      supabaseAdmin.from('attribution_rules').select('workload_id, provider, match_type, match_value').eq('organization_id', orgId)
    ]);

    const wlMap = new Map();
    const wlOptions = (workloads || []).map(w => {
      wlMap.set(w.id, w.name);
      return { id: w.id, name: w.name };
    });

    const keyToWlMap = new Map();
    (rules || []).forEach(r => {
      if (r.match_type?.toLowerCase() === 'api_key') keyToWlMap.set(`${r.provider}:${r.match_value}`, r.workload_id);
    });

    // 2. Fetch ALL usage events for the period to ensure 100% mathematical reconciliation with the Overview API
    // We filter provider and model at DB level to optimize, but workload filtering happens in JS due to attribution mapping.
    let query = supabaseAdmin
      .from('usage_events')
      .select('*')
      .eq('organization_id', orgId)
      .gte('timestamp', startParam)
      .lt('timestamp', endParam)
      .order('timestamp', { ascending: false });

    if (filterProvider && filterProvider !== 'all') {
      query = query.eq('provider', filterProvider);
    }
    if (filterModel && filterModel !== 'all') {
      query = query.eq('model', filterModel);
    }

    const { data: usageData, error: usageError } = await query;
    if (usageError) throw new Error(`Failed to load usage: ${usageError.message}`);

    // 3. Decorate and Filter by Workload in JS
    let enrichedEvents = (usageData || []).map(event => {
      const wlId = keyToWlMap.get(`${event.provider}:${event.api_key_id}`) || null;
      const wlName = wlId ? wlMap.get(wlId) : 'Unattributed';
      return {
        ...event,
        workload_id: wlId,
        workload_name: wlName
      };
    });

    if (filterWorkloadId && filterWorkloadId !== 'all') {
      enrichedEvents = enrichedEvents.filter(e => e.workload_id === filterWorkloadId);
    }

    // 4. Calculate Summary for the fully filtered dataset (reconciliation)
    let totalRequests = 0;
    let totalTokens = 0;
    const costs = aggregateUsageCosts(enrichedEvents);

    const availableProviders = new Set<string>();
    const availableModels = new Set<string>();

    enrichedEvents.forEach(e => {
      totalRequests += getRequestCount(e.request_count);
      // Cache token columns are subsets of input_tokens, not additional tokens.
      totalTokens += getTotalTokenCount(e);
      
      if (e.provider) availableProviders.add(e.provider);
      if (e.model) availableModels.add(e.model);
    });

    const summary = {
      totalRequests,
      totalTokens,
      totalCost: costs.totalCost,
      knownCost: costs.knownCost,
      isCostComplete: costs.isComplete,
      pricedEventCount: costs.pricedEventCount,
      unpricedEventCount: costs.unpricedEventCount,
      totalEvents: enrichedEvents.length
    };

    // 5. Paginate
    const startIndex = (page - 1) * limit;
    const paginatedEvents = enrichedEvents.slice(startIndex, startIndex + limit);

    return NextResponse.json({ 
      events: paginatedEvents,
      summary,
      filters: {
        providers: Array.from(availableProviders),
        models: Array.from(availableModels),
        workloads: wlOptions
      },
      pagination: {
        page,
        limit,
        total: enrichedEvents.length,
        totalPages: Math.ceil(enrichedEvents.length / limit)
      }
    }, { status: 200 });

  } catch (error: any) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error('Usage API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
