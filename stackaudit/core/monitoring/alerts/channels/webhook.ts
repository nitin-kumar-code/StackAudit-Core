import { NotificationChannel, NotificationPayload } from '../types';
import crypto from 'crypto';
import dns from 'dns/promises';
import { URL } from 'url';
import { decryptSecret } from '../../../../lib/crypto';

// Private/loopback/link-local/metadata ranges to block
const BLOCKED_CIDRS = [
  { prefix: '127.',       desc: 'loopback' },
  { prefix: '10.',        desc: 'private (10/8)' },
  { prefix: '0.',         desc: 'unspecified' },
  { prefix: '169.254.',   desc: 'link-local' },
  { prefix: '192.168.',   desc: 'private (192.168/16)' },
];

function isPrivateIP(ip: string): boolean {
  for (const cidr of BLOCKED_CIDRS) {
    if (ip.startsWith(cidr.prefix)) return true;
  }
  // 172.16.0.0/12
  if (ip.startsWith('172.')) {
    const second = parseInt(ip.split('.')[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  // IPv6 loopback
  if (ip === '::1' || ip === '::') return true;
  return false;
}

export async function validateWebhookUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid webhook URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Webhook URL must use HTTPS');
  }

  // Resolve hostname and check all IPs
  let addresses: string[];
  try {
    const results = await dns.resolve4(parsed.hostname);
    addresses = results;
  } catch {
    // If DNS fails, also try resolve6
    try {
      const results6 = await dns.resolve6(parsed.hostname);
      addresses = results6;
    } catch {
      throw new Error(`Cannot resolve webhook hostname: ${parsed.hostname}`);
    }
  }

  for (const ip of addresses) {
    if (isPrivateIP(ip)) {
      throw new Error(`Webhook URL resolves to a private/blocked IP address (${ip})`);
    }
  }
}

const WEBHOOK_TIMEOUT_MS = 10_000; // 10 seconds

export class WebhookChannel implements NotificationChannel {
  type = 'webhook';

  async send(payload: NotificationPayload, config: { url: string; secret?: string }): Promise<void> {
    if (!config.url) throw new Error('Webhook URL is required');

    // A2: SSRF validation
    await validateWebhookUrl(config.url);

    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'stackaudit-monitoring-agent/1.0',
      'X-StackAudit-Timestamp': timestamp,
    };

    if (config.secret) {
      // A3: Decrypt secret before using it
      const rawSecret = decryptSecret(config.secret);
      // Include timestamp in signed content to prevent replay attacks
      const signedContent = `${timestamp}.${body}`;
      const signature = crypto.createHmac('sha256', rawSecret).update(signedContent).digest('hex');
      headers['X-StackAudit-Signature'] = `sha256=${signature}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

    try {
      const response = await fetch(config.url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
        redirect: 'error', // Don't follow redirects
      });

      if (!response.ok) {
        throw new Error(`Webhook returned HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error(`Webhook delivery timed out after ${WEBHOOK_TIMEOUT_MS}ms`);
      }
      throw new Error(`Webhook delivery failed: ${error.message}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
