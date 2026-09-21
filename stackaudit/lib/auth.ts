import { supabaseAdmin } from './supabase/client';

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export async function getAuthOrgId(req: Request): Promise<string> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw new UnauthorizedError('Missing Authorization header');
  }
  
  const token = authHeader.replace('Bearer ', '').trim();
  
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    throw new UnauthorizedError('Invalid or expired token');
  }
  
  // Use app_metadata (server-controlled) instead of user_metadata (client-controlled)
  const orgId = user.app_metadata?.organization_id;
  if (!orgId) {
    throw new ForbiddenError('User does not belong to an organization');
  }
  
  return orgId;
}
