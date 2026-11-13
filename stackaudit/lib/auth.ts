import 'server-only';
import { supabaseAdmin } from './supabase/client';
import {
  ConfigurationError,
  ForbiddenError,
  validateDeploymentSecurity,
  validateWorkspaceConfig,
} from './deployment';

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export { ConfigurationError, ForbiddenError };

export function getConfiguredWorkspaceId(): string {
  return validateWorkspaceConfig();
}

export async function getValidatedWorkspaceId(): Promise<string> {
  validateDeploymentSecurity();
  const id = getConfiguredWorkspaceId();
  const { data: organization, error } = await supabaseAdmin
    .from('organizations')
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (error || !organization) {
    throw new ConfigurationError(
      'The configured StackAudit workspace was not found. Run the local setup/seed flow or set STACKAUDIT_WORKSPACE_ORG_ID to an existing organization.'
    );
  }
  return id;
}

export async function getAuthOrgId(req: Request): Promise<string> {
  const orgId = await getValidatedWorkspaceId();

  // In local preview, a supplied identity may authenticate only for the configured
  // workspace. It can never select or switch the active workspace.
  // In remote mode, unauthenticated access is strictly rejected.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    const mode = process.env.STACKAUDIT_DATABASE_MODE;
    if (mode === 'remote') {
      throw new UnauthorizedError('Authentication required in remote mode');
    }
    return orgId;
  }
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) throw new UnauthorizedError('Invalid Authorization header');
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) throw new UnauthorizedError('Invalid or expired token');
  const userOrgId = user.app_metadata?.organization_id;
  if (!userOrgId || userOrgId !== orgId) {
    throw new ForbiddenError('The authenticated identity is not assigned to the configured local workspace');
  }
  return orgId;
}

export async function getAuthUser(req: Request) {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) throw new UnauthorizedError('Missing or invalid Authorization header');
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) throw new UnauthorizedError('Invalid or expired token');
  return user;
}
