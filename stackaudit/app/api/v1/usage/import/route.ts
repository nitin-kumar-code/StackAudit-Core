import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase/client';
import { ForbiddenError, getAuthOrgId, UnauthorizedError } from '../../../../../lib/auth';
import { validateCanonicalCsv } from '../../../../../core/usage/csv';
import { ingestUsageEvents } from '../../../../../core/usage/ingestion';
import { InMemoryPricingCatalog } from '../../../../../core/pricing/catalog';
import { PricingRecord } from '../../../../../core/types';

export const runtime = 'nodejs';
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_MULTIPART_BODY_BYTES = MAX_FILE_BYTES + 128 * 1024;
const MAX_ROWS = 10_000;
const CHUNK_SIZE = 500;
class ImportInfrastructureError extends Error {}

export async function POST(req: Request) {
  try {
    const orgId = await getAuthOrgId(req);
    const contentType = req.headers.get('content-type') || '';
    if (!/^multipart\/form-data(?:\s*;|$)/i.test(contentType)) {
      return NextResponse.json({ error: 'Upload a CSV file as multipart form data.' }, { status: 400 });
    }

    const contentLength = req.headers.get('content-length');
    if (contentLength !== null) {
      const normalizedLength = contentLength.trim();
      if (!/^\d+$/.test(normalizedLength)) {
        return NextResponse.json({ error: 'Invalid request content length.' }, { status: 400 });
      }
      if (Number(normalizedLength) > MAX_MULTIPART_BODY_BYTES) {
        return NextResponse.json({ error: 'Upload is too large. CSV files must be 5 MB or smaller.' }, { status: 413 });
      }
    }

    // Bound the raw stream before invoking the multipart parser. The small
    // allowance covers the multipart boundary and headers around a 5 MiB file.
    const reader = req.body?.getReader();
    if (!reader) return NextResponse.json({ error: 'Upload a CSV file in the file field.' }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let requestBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      requestBytes += value.byteLength;
      if (requestBytes > MAX_MULTIPART_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return NextResponse.json({ error: 'Upload is too large. CSV files must be 5 MB or smaller.' }, { status: 413 });
      }
      chunks.push(value);
    }

    const boundedBody = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
    const form = await new Response(boundedBody, { headers: { 'content-type': contentType } }).formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Upload a CSV file in the file field.' }, { status: 400 });
    if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'CSV file must be 5 MB or smaller.' }, { status: 413 });

    const parsed = validateCanonicalCsv(await file.text());
    if (parsed.events.length + parsed.errors.filter(error => error.row > 1).length > MAX_ROWS) {
      return NextResponse.json({ error: `CSV cannot exceed ${MAX_ROWS} data rows.` }, { status: 413 });
    }
    if (parsed.errors.length && parsed.errors[0].row === 1) {
      return NextResponse.json({ accepted: 0, rejected: 1, errors: parsed.errors, imported: 0 }, { status: 400 });
    }

    const errors = [...parsed.errors];
    const seen = new Set<string>();
    const unique = parsed.eventRows.filter(({ event, row }) => {
      const key = `${event.provider}\u0000${event.providerReference}`;
      if (seen.has(key)) { errors.push({ row, message: 'Duplicate provider_reference in this file; first occurrence retained.' }); return false; }
      seen.add(key); return true;
    });

    // This precheck avoids unnecessary work for references already present.
    // The insert below remains authoritative and ignores conflicts atomically,
    // covering imports that race after this query.
    const existingRefs = new Set<string>();
    for (const provider of [...new Set(unique.map(item => item.event.provider))]) {
      const refs = unique.filter(item => item.event.provider === provider).map(item => item.event.providerReference);
      for (let offset = 0; offset < refs.length; offset += CHUNK_SIZE) {
        const { data, error } = await supabaseAdmin.from('usage_events')
          .select('provider,provider_reference').eq('organization_id', orgId).eq('provider', provider)
          .in('provider_reference', refs.slice(offset, offset + CHUNK_SIZE));
        if (error) throw new ImportInfrastructureError('Could not check existing usage records.');
        for (const row of data || []) existingRefs.add(`${row.provider}\u0000${row.provider_reference}`);
      }
    }

    const fresh = unique.filter(({ event, row }) => {
      if (existingRefs.has(`${event.provider}\u0000${event.providerReference}`)) {
        errors.push({ row, message: 'This provider_reference was already imported; skipped.' });
        return false;
      }
      return true;
    });

    const { data: prices, error: priceError } = await supabaseAdmin.from('pricing_catalog')
      .select('id,provider,model,input_price,output_price,cache_read_price,cache_creation_price,effective_from,effective_until,source');
    if (priceError) throw new ImportInfrastructureError('Could not load the pricing catalog.');
    const catalog = new InMemoryPricingCatalog((prices || []).map((row): PricingRecord => ({
      id: row.id, provider: row.provider, model: row.model, inputPrice: String(row.input_price), outputPrice: String(row.output_price),
      cacheReadPrice: row.cache_read_price === null ? undefined : String(row.cache_read_price),
      cacheCreationPrice: row.cache_creation_price === null ? undefined : String(row.cache_creation_price),
      effectiveFrom: new Date(row.effective_from), effectiveUntil: row.effective_until ? new Date(row.effective_until) : undefined, source: row.source
    })));

    let imported = 0, unpriced = 0;
    let duplicates = parsed.events.length - fresh.length;
    const failures: Array<{ row: number; message: string }> = [];
    for (let offset = 0; offset < fresh.length; offset += CHUNK_SIZE) {
      const batchRows = fresh.slice(offset, offset + CHUNK_SIZE);
      const batch = batchRows.map(item => item.event);
      const result = await ingestUsageEvents(batch, orgId, catalog, supabaseAdmin, { conflictHandling: 'ignore' });
      imported += result.successful;
      const insertedEventIds = result.insertedEventIds ?? batch.slice(0, result.successful).map(event => event.id);
      const insertedIds = new Set(insertedEventIds);
      const unpricedIds = new Set(result.pricingFailedEventIds ?? []);
      unpriced += insertedEventIds.filter(id => unpricedIds.has(id)).length;

      for (const item of batchRows) {
        if (insertedIds.has(item.event.id)) continue;
        if ((result.conflictEventIds ?? []).includes(item.event.id)) {
          duplicates++;
          errors.push({ row: item.row, message: 'This provider_reference was already imported; skipped.' });
        } else {
          failures.push({ row: item.row, message: 'This row could not be imported; resolve the processing or database issue and retry.' });
        }
      }
    }
    return NextResponse.json({
      validated: parsed.events.length,
      accepted: imported,
      rejected: errors.length + failures.length,
      imported,
      duplicates,
      unpriced,
      errors: [...errors, ...failures],
      message: `${imported} rows imported; ${unpriced} imported without matching pricing.`
    }, { status: errors.length || failures.length ? 207 : 200 });
  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof ImportInfrastructureError) {
      console.error('Usage CSV import infrastructure failure:', error.message);
      return NextResponse.json({ error: 'Import could not access the local database. Check the database and retry.' }, { status: 503 });
    }
    console.error('Usage CSV import failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: error instanceof Error ? error.message : 'CSV import failed.' }, { status: 400 });
  }
}
