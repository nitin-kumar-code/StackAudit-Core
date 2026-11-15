import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { validateServerAddress } from '../run-server';

describe('validateServerAddress', () => {
  it('accepts valid IPv4 and IPv6 addresses', () => {
    expect(validateServerAddress('127.0.0.1', '3000')).toEqual({ host: '127.0.0.1', port: '3000' });
    expect(validateServerAddress('0.0.0.0', '8080')).toEqual({ host: '0.0.0.0', port: '8080' });
    expect(validateServerAddress('192.168.1.100', '4000')).toEqual({ host: '192.168.1.100', port: '4000' });
    expect(validateServerAddress('::1', '3000')).toEqual({ host: '::1', port: '3000' });
  });

  it('accepts valid RFC-compliant hostnames', () => {
    expect(validateServerAddress('localhost', '3000')).toEqual({ host: 'localhost', port: '3000' });
    expect(validateServerAddress('internal.app.lan', '80')).toEqual({ host: 'internal.app.lan', port: '80' });
  });

  it('rejects shell metacharacters and command injection attempts in host', () => {
    expect(() => validateServerAddress('localhost; rm -rf /', '3000')).toThrow(/IP address or a valid hostname/);
    expect(() => validateServerAddress('$(id)', '3000')).toThrow(/IP address or a valid hostname/);
    expect(() => validateServerAddress('127.0.0.1 && cat /etc/passwd', '3000')).toThrow(/IP address or a valid hostname/);
    expect(() => validateServerAddress('`whoami`', '3000')).toThrow(/IP address or a valid hostname/);
    expect(() => validateServerAddress('host|nc -e /bin/sh', '3000')).toThrow(/IP address or a valid hostname/);
  });

  it('validates port range and rejects non-numeric or out-of-range ports', () => {
    expect(validateServerAddress('localhost', '1')).toEqual({ host: 'localhost', port: '1' });
    expect(validateServerAddress('localhost', '65535')).toEqual({ host: 'localhost', port: '65535' });
    expect(() => validateServerAddress('localhost', '0')).toThrow(/PORT must be an integer between 1 and 65535/);
    expect(() => validateServerAddress('localhost', '65536')).toThrow(/PORT must be an integer between 1 and 65535/);
    expect(() => validateServerAddress('localhost', '-1')).toThrow(/PORT must be an integer between 1 and 65535/);
    expect(() => validateServerAddress('localhost', '3000; whoami')).toThrow(/PORT must be an integer between 1 and 65535/);
    expect(() => validateServerAddress('localhost', 'abc')).toThrow(/PORT must be an integer between 1 and 65535/);
  });
});
