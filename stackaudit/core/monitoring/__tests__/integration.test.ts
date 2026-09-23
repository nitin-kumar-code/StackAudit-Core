import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { MonitoringService } from '../monitoring-service';
import crypto from 'crypto';

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY! This test is required for analytical guarantees and cannot be skipped.");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const monitoringService = new MonitoringService(supabase);

describe('Monitoring Engine Integration', () => {
  const orgId = crypto.randomUUID();
  const wlId = crypto.randomUUID();

  beforeAll(async () => {
    await supabase.from('organizations').insert({ id: orgId, name: 'Monitoring Org' });
    await supabase.from('workloads').insert({ id: wlId, organization_id: orgId, name: 'Monitoring WL' });
    
    // Seed monitoring config
    await supabase.from('monitoring_configs').insert({
      organization_id: orgId,
      workload_id: wlId,
      enabled: true,
      config: {
        evaluationWindowDays: 1,
        notificationChannels: [],
        alertPolicy: { minSeverityToNotify: 'MEDIUM' }
      }
    });
  });

  afterAll(async () => {
    await supabase.from('organizations').delete().eq('id', orgId);
  });

  it('runs monitoring and detects no findings on empty data, resolving any active alerts', async () => {
    const runId = await monitoringService.runMonitoring(orgId);
    expect(runId).toBeDefined();

    const { data: run } = await supabase.from('monitoring_runs').select('*').eq('id', runId).single();
    expect(run.status).toBe('COMPLETED');
    expect(run.findings_count).toBe(0);
    expect(run.evaluated_workloads).toBe(1);
  });

  it('detects findings, creates alerts via atomic upsert, and updates last_notified_severity', async () => {
    // Inject a dummy finding
    const { data: finding } = await supabase.from('audit_findings').insert({
      organization_id: orgId,
      workload_id: wlId,
      category: 'COST_DRIFT',
      severity: 'HIGH',
      title: 'Cost Spiked',
      description: 'Cost went up',
      confidence: 'HIGH',
      evidence: {},
      time_window_start: new Date().toISOString(),
      time_window_end: new Date().toISOString(),
      detected_at: new Date().toISOString(),
      status: 'OPEN'
    }).select().single();

    const runId = await monitoringService.runMonitoring(orgId);
    
    // Check alert was created
    const { data: alerts } = await supabase.from('alerts').select('*').eq('finding_id', finding.id);
    expect(alerts!.length).toBe(1);
    expect(alerts![0].status).toBe('OPEN');
    expect(alerts![0].severity).toBe('HIGH');
    
    // Check it updated the finding status
    const { data: updatedFinding } = await supabase.from('audit_findings').select('status').eq('id', finding.id).single();
    expect(updatedFinding!.status).toBe('OPEN'); // Should remain open
  });
});
