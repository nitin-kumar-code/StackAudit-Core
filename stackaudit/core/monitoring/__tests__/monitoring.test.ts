import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlertService } from '../alerts/service';
import { WebhookChannel } from '../alerts/channels/webhook';
import { AuditFinding } from '../../types';
import dns from 'dns/promises';

vi.mock('dns/promises');

describe('Alert Policy & Channels', () => {
  beforeEach(() => {
    vi.mocked(dns.resolve4).mockResolvedValue(['8.8.8.8']);
    vi.mocked(dns.resolve6).mockRejectedValue(new Error('no ipv6'));
  });

  it('generates a deterministic fingerprint', () => {
    const fp1 = AlertService.generateFingerprint('org_1', 'wl_1', 'COST_DRIFT');
    const fp2 = AlertService.generateFingerprint('org_1', 'wl_1', 'COST_DRIFT');
    const fp3 = AlertService.generateFingerprint('org_1', null, 'COST_DRIFT');

    expect(fp1).toBe(fp2);
    expect(fp1).not.toBe(fp3);
  });

  it('fails webhook delivery cleanly if HTTP status is bad', async () => {
    const channel = new WebhookChannel();
    
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request'
    });

    await expect(channel.send({
      event: 'ai_cost_alert',
      alertId: '123',
      severity: 'HIGH',
      category: 'COST_DRIFT',
      title: 'Test',
      description: 'Test',
      evidence: {},
      timestamp: new Date().toISOString()
    }, { url: 'https://test.com' })).rejects.toThrow(/HTTP 400/);
  });
});
