import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../../lib/supabase/client';
import { repriceUnpricedEvents } from '../../../../../../core/usage/repricing';
import { InMemoryPricingCatalog } from '../../../../../../core/pricing/catalog';

/**
 * Internal cron endpoint to trigger repricing of unpriced events.
 * Authenticated by CRON_SECRET header, NOT a user JWT.
 */
export async function POST(req: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
    }

    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '').trim();

    if (!token || token !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Load catalog (In a real app, this would be loaded from the DB)
    const { data: catalogRows } = await supabaseAdmin.from('pricing_catalog').select('*');
    const records = (catalogRows || []).map((r) => ({
      id: r.id,
      provider: r.provider,
      model: r.model,
      inputPrice: r.input_price,
      outputPrice: r.output_price,
      cacheReadPrice: r.cache_read_price,
      cacheCreationPrice: r.cache_creation_price,
      effectiveFrom: new Date(r.effective_from),
      effectiveUntil: r.effective_until ? new Date(r.effective_until) : undefined,
      source: r.source
    }));
    
    const catalog = new InMemoryPricingCatalog(records);

    // Get all distinct orgs that have unpriced events
    const { data: orgs } = await supabaseAdmin
      .from('usage_events')
      .select('organization_id')
      .eq('is_unpriced', true);
      
    const uniqueOrgs = Array.from(new Set((orgs || []).map((o) => o.organization_id)));
    
    let totalAttempted = 0;
    let totalSuccessful = 0;
    let totalStillUnpriced = 0;

    // Reprice per org
    for (const orgId of uniqueOrgs) {
      const result = await repriceUnpricedEvents(orgId, catalog, supabaseAdmin);
      totalAttempted += result.totalAttempted;
      totalSuccessful += result.successful;
      totalStillUnpriced += result.stillUnpriced;
    }

    return NextResponse.json({ 
      processedOrgs: uniqueOrgs.length,
      totalAttempted,
      totalSuccessful,
      totalStillUnpriced
    }, { status: 200 });
  } catch (error: unknown) {
    console.error('Repricing Cron Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
