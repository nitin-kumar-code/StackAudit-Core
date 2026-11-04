import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { maybeSingle, eq, select, getUser } = vi.hoisted(() => ({
  maybeSingle: vi.fn(), eq: vi.fn(), select: vi.fn(), getUser: vi.fn()
}));
vi.mock('./supabase/client', () => ({
  supabaseAdmin: {
    from: () => ({ select, eq, maybeSingle }),
    auth: { getUser }
  }
}));
vi.mock('server-only', () => ({}));

import { ConfigurationError, ForbiddenError, getAuthOrgId, getConfiguredWorkspaceId } from './auth';

const workspace = '8a775c7f-e31c-8f9b-9000-000000000001';

describe('single-user workspace access', () => {
  beforeEach(() => {
    vi.stubEnv('STACKAUDIT_WORKSPACE_ORG_ID', workspace);
    vi.clearAllMocks();
    select.mockReturnThis();
    eq.mockReturnThis();
    maybeSingle.mockResolvedValue({ data: { id: workspace }, error: null });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('fails when workspace configuration is missing or malformed', () => {
    vi.stubEnv('STACKAUDIT_WORKSPACE_ORG_ID', '');
    expect(() => getConfiguredWorkspaceId()).toThrow(ConfigurationError);
    vi.stubEnv('STACKAUDIT_WORKSPACE_ORG_ID', 'not-a-uuid');
    expect(() => getConfiguredWorkspaceId()).toThrow(ConfigurationError);
  });

  it('rejects a configured organization that does not exist', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(getAuthOrgId(new Request('http://localhost/api'))).rejects.toThrow(ConfigurationError);
    expect(eq).toHaveBeenCalledWith('id', workspace);
  });

  it('uses only the configured organization and ignores request organization selectors', async () => {
    const result = await getAuthOrgId(new Request(`http://localhost/api?organizationId=${crypto.randomUUID()}`));
    expect(result).toBe(workspace);
    expect(eq).toHaveBeenCalledWith('id', workspace);
    expect(select).toHaveBeenCalledWith('id');
  });

  it('rejects a valid identity assigned to a different organization', async () => {
    getUser.mockResolvedValue({ data: { user: { app_metadata: { organization_id: crypto.randomUUID() } } }, error: null });
    const request = new Request('http://localhost/api', { headers: { Authorization: 'Bearer test-token' } });
    await expect(getAuthOrgId(request)).rejects.toThrow(ForbiddenError);
  });

  it('rejects invalid bearer identities', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('invalid') });
    const request = new Request('http://localhost/api', { headers: { Authorization: 'Bearer bad-token' } });
    await expect(getAuthOrgId(request)).rejects.toThrow('Invalid or expired token');
  });
});
