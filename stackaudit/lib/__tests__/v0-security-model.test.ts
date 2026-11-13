import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Mock Supabase client for auth & workspace tests
const { queryObj, maybeSingle, eq, select, getUser } = vi.hoisted(() => {
  const selectFn = vi.fn();
  const eqFn = vi.fn();
  const maybeSingleFn = vi.fn();
  const q: Record<string, unknown> = {
    select: selectFn,
    eq: eqFn,
    maybeSingle: maybeSingleFn,
  };
  selectFn.mockReturnValue(q);
  eqFn.mockReturnValue(q);
  maybeSingleFn.mockResolvedValue({ data: { id: '8a775c7f-e31c-8f9b-9000-000000000001' }, error: null });

  return {
    queryObj: q,
    select: selectFn,
    eq: eqFn,
    maybeSingle: maybeSingleFn,
    getUser: vi.fn(),
  };
});

vi.mock('../supabase/client', () => ({
  supabaseAdmin: {
    from: () => queryObj,
    auth: { getUser },
  },
}));
vi.mock('server-only', () => ({}));

import {
  ConfigurationError,
  ForbiddenError,
  UnauthorizedError,
  getAuthOrgId,
  getConfiguredWorkspaceId,
  getValidatedWorkspaceId,
} from '../auth';
import {
  validateDeploymentMode,
  validateNetworkBinding,
  validateWorkspaceConfig,
  validateDeploymentSecurity,
  deploymentEnvironmentSchema,
  isLoopbackHost,
} from '../deployment';
import {
  hasEncryptionKey,
  getEncryptionKey,
  encryptSecret,
  decryptSecret,
} from '../crypto';

const validWorkspace = '8a775c7f-e31c-8f9b-9000-000000000001';

describe('V0 Security Model: Configuration Safeguards', () => {
  beforeEach(() => {
    vi.stubEnv('STACKAUDIT_WORKSPACE_ORG_ID', validWorkspace);
    vi.stubEnv('STACKAUDIT_DATABASE_MODE', 'local');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'valid-mock-service-key');
    delete process.env.STACKAUDIT_ORG_ID;
    delete process.env.STACKAUDIT_DEPLOYMENT_MODE;
    delete process.env.STACKAUDIT_ALLOW_PRIVATE_NETWORK;
    delete process.env.HOST;
    delete process.env.HOSTNAME;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fails safely when workspace ID is missing', () => {
    vi.stubEnv('STACKAUDIT_WORKSPACE_ORG_ID', '');
    delete process.env.STACKAUDIT_ORG_ID;
    expect(() => getConfiguredWorkspaceId()).toThrow(ConfigurationError);
    expect(() => getConfiguredWorkspaceId()).toThrow(/STACKAUDIT_WORKSPACE_ORG_ID is required/i);
  });

  it('fails safely when workspace ID is malformed (not a valid UUID)', () => {
    vi.stubEnv('STACKAUDIT_WORKSPACE_ORG_ID', 'not-a-valid-uuid');
    expect(() => getConfiguredWorkspaceId()).toThrow(ConfigurationError);
    expect(() => getConfiguredWorkspaceId()).toThrow(/must be a valid UUID/i);
  });

  it('supports STACKAUDIT_ORG_ID as an alternative explicit workspace identifier', () => {
    delete process.env.STACKAUDIT_WORKSPACE_ORG_ID;
    vi.stubEnv('STACKAUDIT_ORG_ID', validWorkspace);
    expect(getConfiguredWorkspaceId()).toBe(validWorkspace);
    expect(validateWorkspaceConfig(process.env)).toBe(validWorkspace);
  });

  it('rejects conflicting STACKAUDIT_ORG_ID and STACKAUDIT_WORKSPACE_ORG_ID values', () => {
    vi.stubEnv('STACKAUDIT_WORKSPACE_ORG_ID', validWorkspace);
    vi.stubEnv('STACKAUDIT_ORG_ID', '9b885c7f-e31c-8f9b-9000-000000000002');
    expect(() => getConfiguredWorkspaceId()).toThrow(ConfigurationError);
    expect(() => getConfiguredWorkspaceId()).toThrow(/Conflicting workspace identifiers/i);
  });

  it('defaults to local deployment mode when mode is unset and does not silently enable public deployment', () => {
    delete process.env.STACKAUDIT_DEPLOYMENT_MODE;
    const mode = validateDeploymentMode();
    expect(mode).toBe('local');
  });

  it('rejects unsupported deployment configurations (public, saas, multi-tenant)', () => {
    expect(() => validateDeploymentMode('public')).toThrow(ConfigurationError);
    expect(() => validateDeploymentMode('public')).toThrow(/does not support public multi-tenant or SaaS/i);
    expect(() => validateDeploymentMode('saas')).toThrow(ConfigurationError);
    expect(() => validateDeploymentMode('multi-tenant')).toThrow(ConfigurationError);
    expect(() => validateDeploymentMode('shared')).toThrow(ConfigurationError);
    expect(() => validateDeploymentMode('production')).toThrow(ConfigurationError);
  });

  it('validates environment with Zod schema and catches missing workspace', () => {
    const result = deploymentEnvironmentSchema.safeParse({
      STACKAUDIT_DEPLOYMENT_MODE: 'local',
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    });
    expect(result.success).toBe(false);
  });
});

describe('V0 Security Model: Organization Isolation', () => {
  beforeEach(() => {
    vi.stubEnv('STACKAUDIT_WORKSPACE_ORG_ID', validWorkspace);
    vi.stubEnv('STACKAUDIT_DATABASE_MODE', 'local');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'valid-mock-service-key');
    select.mockReturnValue(queryObj);
    eq.mockReturnValue(queryObj);
    maybeSingle.mockResolvedValue({ data: { id: validWorkspace }, error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('never performs first-organization fallback when workspace is not found', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(getValidatedWorkspaceId()).rejects.toThrow(ConfigurationError);
    await expect(getValidatedWorkspaceId()).rejects.toThrow(/workspace was not found/i);
    // Verified: strictly filters by the explicit workspace ID, never queries without .eq('id', ...)
    expect(eq).toHaveBeenCalledWith('id', validWorkspace);
  });

  it('prevents callers from overriding the configured workspace via query string', async () => {
    const attackerOrg = crypto.randomUUID();
    const req = new Request(`http://localhost/api/v1/workloads?organizationId=${attackerOrg}`);
    const resolvedOrg = await getAuthOrgId(req);
    expect(resolvedOrg).toBe(validWorkspace);
    expect(resolvedOrg).not.toBe(attackerOrg);
  });

  it('prevents callers from overriding the configured workspace via request headers', async () => {
    const attackerOrg = crypto.randomUUID();
    const req = new Request('http://localhost/api/v1/workloads', {
      headers: { 'X-Organization-Id': attackerOrg, 'X-Tenant-Id': attackerOrg },
    });
    const resolvedOrg = await getAuthOrgId(req);
    expect(resolvedOrg).toBe(validWorkspace);
    expect(resolvedOrg).not.toBe(attackerOrg);
  });

  it('strictly rejects unauthenticated requests when database mode is remote', async () => {
    vi.stubEnv('STACKAUDIT_DATABASE_MODE', 'remote');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://remote.supabase.co');
    const req = new Request('https://remote.example.com/api/v1/workloads');
    await expect(getAuthOrgId(req)).rejects.toThrow(UnauthorizedError);
  });

  it('strictly rejects identities assigned to another organization (cross-tenant IDOR prevention)', async () => {
    const foreignOrg = crypto.randomUUID();
    getUser.mockResolvedValue({
      data: { user: { id: 'user-1', app_metadata: { organization_id: foreignOrg } } },
      error: null,
    });
    const req = new Request('http://localhost/api/v1/workloads', {
      headers: { Authorization: 'Bearer valid-jwt-for-foreign-org' },
    });
    await expect(getAuthOrgId(req)).rejects.toThrow(ForbiddenError);
    await expect(getAuthOrgId(req)).rejects.toThrow(/not assigned to the configured local workspace/i);
  });

  it('accepts bearer identities assigned to the configured workspace', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'user-1', app_metadata: { organization_id: validWorkspace } } },
      error: null,
    });
    const req = new Request('http://localhost/api/v1/workloads', {
      headers: { Authorization: 'Bearer valid-jwt-for-own-org' },
    });
    const org = await getAuthOrgId(req);
    expect(org).toBe(validWorkspace);
  });
});

describe('V0 Security Model: Credential Protection', () => {
  const root = process.cwd();

  it('keeps SUPABASE_SERVICE_ROLE_KEY server-side and never exposes NEXT_PUBLIC_ service role key', () => {
    const clientSource = readFileSync(join(root, 'lib/supabase/client.ts'), 'utf8');
    expect(clientSource).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(clientSource).not.toContain('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY');
    expect(clientSource).not.toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    expect(clientSource).toContain("import 'server-only';");
  });

  it('ensures client components ("use client") never import the server Supabase admin client', () => {
    const files: string[] = [];
    const scanDir = (dir: string) => {
      for (const entry of readdirSync(join(root, dir))) {
        const full = join(dir, entry);
        if (statSync(join(root, full)).isDirectory()) {
          scanDir(full);
        } else if (/\.(tsx?|jsx?)$/.test(entry)) {
          files.push(full);
        }
      }
    };
    scanDir('app');
    for (const file of files) {
      const content = readFileSync(join(root, file), 'utf8');
      if (/^['"]use client['"];?/m.test(content)) {
        expect(content, `${file} must not import privileged Supabase client`).not.toMatch(/supabase\/client|supabaseAdmin/);
      }
    }
  });

  it('ensures API routes never include sensitive secrets in response payloads', () => {
    const apiFiles: string[] = [];
    const scanDir = (dir: string) => {
      for (const entry of readdirSync(join(root, dir))) {
        const full = join(dir, entry);
        if (statSync(join(root, full)).isDirectory()) {
          scanDir(full);
        } else if (/route\.(ts|js)$/.test(entry)) {
          apiFiles.push(full);
        }
      }
    };
    scanDir('app/api');
    for (const file of apiFiles) {
      const content = readFileSync(join(root, file), 'utf8');
      expect(content, `${file} must not return service role key in JSON response`).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
      expect(content, `${file} must not return CRON_SECRET in JSON response`).not.toMatch(/json\(\s*\{[^}]*CRON_SECRET/);
      expect(content, `${file} must not return WEBHOOK_ENCRYPTION_KEY in JSON response`).not.toMatch(/json\(\s*\{[^}]*WEBHOOK_ENCRYPTION_KEY/);
    }
  });
});

describe('V0 Security Model: Deployment Boundary & Network Binding', () => {
  beforeEach(() => {
    vi.stubEnv('STACKAUDIT_WORKSPACE_ORG_ID', validWorkspace);
    vi.stubEnv('STACKAUDIT_DATABASE_MODE', 'local');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'valid-mock-service-key');
    delete process.env.HOST;
    delete process.env.HOSTNAME;
    delete process.env.STACKAUDIT_DEPLOYMENT_MODE;
    delete process.env.STACKAUDIT_ALLOW_PRIVATE_NETWORK;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('verifies that package.json scripts dev and start bind strictly to 127.0.0.1 by default', () => {
    const pkgJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
    expect(pkgJson.scripts.dev).toContain('-H 127.0.0.1');
    expect(pkgJson.scripts.start).toContain('-H 127.0.0.1');
  });

  it('rejects wildcard binding (0.0.0.0) in local deployment mode', () => {
    expect(() => validateNetworkBinding('local', '0.0.0.0')).toThrow(ConfigurationError);
    expect(() => validateNetworkBinding('local', '0.0.0.0')).toThrow(/prohibited in local deployment mode/i);
    expect(() => validateNetworkBinding('local', '::')).toThrow(ConfigurationError);
  });

  it('rejects non-loopback LAN addresses in local deployment mode', () => {
    expect(() => validateNetworkBinding('local', '10.185.227.118')).toThrow(ConfigurationError);
    expect(() => validateNetworkBinding('local', '10.185.227.118')).toThrow(/Non-loopback host binding/i);
    expect(() => validateNetworkBinding('local', '192.168.1.100')).toThrow(ConfigurationError);
    expect(() => validateNetworkBinding('local', '172.16.0.5')).toThrow(ConfigurationError);
  });

  it('permits private network hosts when private-network mode is opted into', () => {
    expect(() => validateNetworkBinding('private-network', '10.185.227.118')).not.toThrow();
    expect(() => validateNetworkBinding('private-network', '0.0.0.0')).not.toThrow();
    expect(() => validateNetworkBinding('private-network', '192.168.1.100')).not.toThrow();
  });

  it('verifies that package.json provides dedicated private-network launch scripts', () => {
    const pkgJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
    expect(pkgJson.scripts['dev:private-network']).toContain('scripts/run-server.ts dev');
    expect(pkgJson.scripts['start:private-network']).toContain('scripts/run-server.ts start');
  });

  it('correctly identifies loopback vs non-loopback hosts via isLoopbackHost', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('127.0.0.1:3000')).toBe(true);
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('localhost:8080')).toBe(true);
    expect(isLoopbackHost('::1')).toBe(true);
    expect(isLoopbackHost('[::1]')).toBe(true);
    expect(isLoopbackHost('0.0.0.0')).toBe(false);
    expect(isLoopbackHost('10.0.0.1')).toBe(false);
    expect(isLoopbackHost('192.168.1.1')).toBe(false);
    expect(isLoopbackHost('example.com')).toBe(false);
  });

  it('allows loopback host binding (127.0.0.1, localhost, ::1) in local deployment mode', () => {
    expect(() => validateNetworkBinding('local', '127.0.0.1')).not.toThrow();
    expect(() => validateNetworkBinding('local', 'localhost')).not.toThrow();
    expect(() => validateNetworkBinding('local', '::1')).not.toThrow();
    expect(() => validateNetworkBinding('local', undefined)).not.toThrow();
  });

  it('requires explicit opt-in confirmation for private-network deployment mode', () => {
    expect(() => validateDeploymentMode('private-network', undefined)).toThrow(ConfigurationError);
    expect(() => validateDeploymentMode('private-network', 'false')).toThrow(ConfigurationError);
    expect(() => validateDeploymentMode('private-network', 'false')).toThrow(/STACKAUDIT_ALLOW_PRIVATE_NETWORK=true/i);

    expect(validateDeploymentMode('private-network', 'true')).toBe('private-network');
  });

  it('rejects remote database in local deployment mode', () => {
    vi.stubEnv('STACKAUDIT_DEPLOYMENT_MODE', 'local');
    vi.stubEnv('STACKAUDIT_DATABASE_MODE', 'local');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://remote.supabase.co');

    expect(() => validateDeploymentSecurity(process.env)).toThrow(/requires a localhost/i);
  });

  it('passes comprehensive deployment validation in safe local configuration', () => {
    vi.stubEnv('STACKAUDIT_DEPLOYMENT_MODE', 'local');
    vi.stubEnv('STACKAUDIT_DATABASE_MODE', 'local');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('STACKAUDIT_WORKSPACE_ORG_ID', validWorkspace);
    vi.stubEnv('HOST', '127.0.0.1');

    const result = validateDeploymentSecurity(process.env);
    expect(result.mode).toBe('local');
    expect(result.workspaceId).toBe(validWorkspace);
  });
});

describe('V0 Security Model: Webhook Encryption Fail-Closed Safeguards', () => {
  const env = process.env as Record<string, string | undefined>;
  const origEnv = env.NODE_ENV;
  const origVitest = env.VITEST;

  afterEach(() => {
    env.NODE_ENV = origEnv;
    if (origVitest !== undefined) env.VITEST = origVitest;
    delete env.WEBHOOK_ENCRYPTION_KEY;
  });

  it('fails closed when WEBHOOK_ENCRYPTION_KEY is missing outside test environment', () => {
    env.NODE_ENV = 'production';
    delete env.VITEST;
    delete env.WEBHOOK_ENCRYPTION_KEY;

    expect(() => getEncryptionKey()).toThrow(/WEBHOOK_ENCRYPTION_KEY is required/i);
    expect(() => encryptSecret('secret-token')).toThrow(/Cannot encrypt webhook secret: WEBHOOK_ENCRYPTION_KEY is not configured/i);
    expect(() => decryptSecret('1234:5678:90ab')).toThrow(/Failed to decrypt webhook secret: WEBHOOK_ENCRYPTION_KEY is not configured/i);
  });

  it('accepts valid 64-char hex key and encrypts/decrypts correctly', () => {
    const validKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    env.WEBHOOK_ENCRYPTION_KEY = validKey;
    expect(hasEncryptionKey()).toBe(true);

    const secret = 'prod-operator-secret';
    const encrypted = encryptSecret(secret);
    expect(encrypted).toContain(':');
    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(secret);
  });

  it('allows unencrypted legacy secrets through decryptSecret without key', () => {
    env.NODE_ENV = 'production';
    delete env.VITEST;
    delete env.WEBHOOK_ENCRYPTION_KEY;

    expect(decryptSecret('raw-unencrypted-secret')).toBe('raw-unencrypted-secret');
  });
});

describe('V0 Security Model: Internal Monitoring Single-Workspace Enforcement', () => {
  it('ensures POST /api/v1/internal/monitoring/run rejects caller organization override', async () => {
    const { POST } = await import('../../app/api/v1/internal/monitoring/run/route');
    process.env.CRON_SECRET = 'valid-test-cron-secret';
    process.env.STACKAUDIT_WORKSPACE_ORG_ID = validWorkspace;

    // Call with mismatched organization_id in query params
    const req = new Request('http://127.0.0.1:3000/api/v1/internal/monitoring/run?organization_id=99999999-9999-4999-9999-999999999999', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid-test-cron-secret',
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('Cannot target arbitrary organization');
  });

  it('ensures POST /api/v1/internal/monitoring/run requires CRON_SECRET authentication', async () => {
    const { POST } = await import('../../app/api/v1/internal/monitoring/run/route');
    process.env.CRON_SECRET = 'valid-test-cron-secret';

    const req = new Request('http://127.0.0.1:3000/api/v1/internal/monitoring/run', {
      method: 'POST',
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
