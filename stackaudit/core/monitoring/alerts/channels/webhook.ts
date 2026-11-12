import { NotificationChannel, NotificationPayload } from '../types';
import crypto from 'crypto';
import dns from 'dns/promises';
import net from 'net';
import { URL } from 'url';
import { Agent } from 'undici';
import { decryptSecret } from '../../../../lib/crypto';

export function isPrivateIPv4(ip: string): boolean {
  if (!ip) return true;
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return true;
  const [b0, b1, b2, b3] = parts;
  if (b0 === 127) return true; // 127.0.0.0/8 loopback
  if (b0 === 10) return true;  // 10.0.0.0/8 private
  if (b0 === 0) return true;   // 0.0.0.0/8 unspecified
  if (b0 === 169 && b1 === 254) return true; // 169.254.0.0/16 link-local
  if (b0 === 192 && b1 === 168) return true; // 192.168.0.0/16 private
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true; // 172.16.0.0/12 private
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return true; // 100.64.0.0/10 CGNAT
  if (b0 === 198 && (b1 === 18 || b1 === 19)) return true; // 198.18.0.0/15 benchmarking
  if (b0 === 192 && b1 === 0 && b2 === 2) return true; // 192.0.2.0/24 documentation
  if (b0 === 198 && b1 === 51 && b2 === 100) return true; // 198.51.100.0/24 documentation
  if (b0 === 203 && b1 === 0 && b2 === 113) return true; // 203.0.113.0/24 documentation
  if (b0 >= 224 && b0 <= 239) return true; // multicast
  if (b0 === 255 && b1 === 255 && b2 === 255 && b3 === 255) return true; // broadcast
  return false;
}

export function parseIPv6ToBytes(ip: string): Uint8Array | null {
  let normalized = ip.trim().toLowerCase().replace(/^\[|\]$/g, '');

  // Handle dotted-decimal suffix if present (e.g. ::ffff:192.168.1.1 or 64:ff9b::192.168.1.1)
  const lastColon = normalized.lastIndexOf(':');
  if (lastColon !== -1) {
    const potentialV4 = normalized.slice(lastColon + 1);
    if (potentialV4.includes('.')) {
      const parts = potentialV4.split('.');
      if (parts.length !== 4) return null;
      const v4Bytes: number[] = [];
      for (const p of parts) {
        if (!/^\d+$/.test(p)) return null;
        const n = parseInt(p, 10);
        if (n < 0 || n > 255) return null;
        v4Bytes.push(n);
      }
      const hexPart1 = ((v4Bytes[0] << 8) | v4Bytes[1]).toString(16);
      const hexPart2 = ((v4Bytes[2] << 8) | v4Bytes[3]).toString(16);
      normalized = normalized.slice(0, lastColon + 1) + hexPart1 + ':' + hexPart2;
    }
  }

  // Handle :: expansion
  let groups: string[];
  if (normalized.includes('::')) {
    const parts = normalized.split('::');
    if (parts.length > 2) return null;
    const left = parts[0] ? parts[0].split(':') : [];
    const right = parts[1] ? parts[1].split(':') : [];
    const missing = 8 - (left.length + right.length);
    if (missing < 1) return null;
    groups = [...left, ...Array(missing).fill('0'), ...right];
  } else {
    groups = normalized.split(':');
  }

  if (groups.length !== 8) return null;

  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    const g = groups[i];
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    const val = parseInt(g, 16);
    bytes[i * 2] = (val >> 8) & 0xff;
    bytes[i * 2 + 1] = val & 0xff;
  }
  return bytes;
}

export function isPrivateIPv6(ip: string): boolean {
  const bytes = parseIPv6ToBytes(ip);
  if (!bytes) return true; // Invalid format treated as blocked

  // IPv4-mapped (::ffff:0:0/96) - handles dotted decimal and hex (e.g. ::ffff:7f00:1)
  const isV4Mapped = bytes.slice(0, 10).every(b => b === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  if (isV4Mapped) {
    return isPrivateIPv4(`${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`);
  }

  // IPv4-compatible (::/96)
  const isV4Compatible = bytes.slice(0, 12).every(b => b === 0);
  if (isV4Compatible) {
    // :: (unspecified) and ::1 (loopback)
    if (bytes[12] === 0 && bytes[13] === 0 && bytes[14] === 0 && (bytes[15] === 0 || bytes[15] === 1)) {
      return true;
    }
    return isPrivateIPv4(`${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`);
  }

  // Loopback (::1) or Unspecified (::)
  if (bytes.slice(0, 15).every(b => b === 0) && (bytes[15] === 0 || bytes[15] === 1)) return true;

  // ULA fc00::/7 (fc00:: - fdff::)
  if ((bytes[0] & 0xfe) === 0xfc) return true;

  // Link-local unicast fe80::/10 (fe80:: - febf::)
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return true;

  // Site-local unicast fec0::/10 (deprecated RFC 3879)
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0xc0) return true;

  // Multicast ff00::/8
  if (bytes[0] === 0xff) return true;

  // Documentation 2001:db8::/32
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) return true;

  // Discard prefix 100::/64
  if (bytes[0] === 0x01 && bytes[1] === 0x00 && bytes.slice(2, 8).every(b => b === 0)) return true;

  // NAT64 well-known 64:ff9b::/96
  if (bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b && bytes.slice(4, 12).every(b => b === 0)) {
    return isPrivateIPv4(`${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`);
  }

  return false;
}

export function isPrivateIP(ip: string): boolean {
  const trimmed = ip.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (trimmed.includes(':')) {
    return isPrivateIPv6(trimmed);
  }
  return isPrivateIPv4(trimmed);
}

export interface ValidatedWebhookEndpoint {
  url: string;
  pinnedIp: string;
  family: 4 | 6;
}

export async function validateWebhookUrl(url: string): Promise<ValidatedWebhookEndpoint> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid webhook URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Webhook URL must use HTTPS');
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');

  // If hostname is directly an IP literal (IPv4 or IPv6), validate immediately without DNS
  if (net.isIP(hostname)) {
    if (isPrivateIP(hostname)) {
      throw new Error(`Webhook URL resolves to a private/blocked IP address (${hostname})`);
    }
    return {
      url,
      pinnedIp: hostname,
      family: (net.isIPv6(hostname) ? 6 : 4) as 4 | 6,
    };
  }

  // Resolve hostname and check all IPs across BOTH IPv4 and IPv6 to prevent dual-stack bypasses
  const [res4, res6] = await Promise.allSettled([
    dns.resolve4(hostname),
    dns.resolve6(hostname)
  ]);

  const candidates: Array<{ ip: string; family: 4 | 6 }> = [];
  if (res4.status === 'fulfilled') {
    for (const ip of res4.value) candidates.push({ ip, family: 4 });
  }
  if (res6.status === 'fulfilled') {
    for (const ip of res6.value) candidates.push({ ip, family: 6 });
  }

  if (candidates.length === 0) {
    throw new Error(`Cannot resolve webhook hostname: ${hostname}`);
  }

  for (const { ip } of candidates) {
    if (isPrivateIP(ip)) {
      throw new Error(`Webhook URL resolves to a private/blocked IP address (${ip})`);
    }
  }

  const selected = candidates[0];
  return {
    url,
    pinnedIp: selected.ip,
    family: selected.family,
  };
}

const WEBHOOK_TIMEOUT_MS = 10_000; // 10 seconds

export class WebhookChannel implements NotificationChannel {
  type = 'webhook';

  async send(payload: NotificationPayload, config: { url: string; secret?: string }): Promise<void> {
    if (!config.url) throw new Error('Webhook URL is required');

    // A2: Validate URL and retrieve pinned destination IP to prevent SSRF and DNS rebinding (TOCTOU)
    const { pinnedIp, family } = await validateWebhookUrl(config.url);

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

    // Pin connection to validated IP to close DNS rebinding TOCTOU window while preserving TLS SNI
    const agent = new Agent({
      connect: {
        lookup: (_hostname, options, callback) => {
          if (options && options.all) {
            callback(null, [{ address: pinnedIp, family }]);
          } else {
            callback(null, pinnedIp, family);
          }
        },
      },
    });

    try {
      const response = await fetch(config.url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
        redirect: 'error', // Don't follow redirects
        dispatcher: agent,
      } as RequestInit);

      if (!response.ok) {
        throw new Error(`Webhook returned HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Webhook delivery timed out after ${WEBHOOK_TIMEOUT_MS}ms`);
      }
      throw new Error(`Webhook delivery failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timeoutId);
      await agent.close().catch(() => {});
    }
  }
}
