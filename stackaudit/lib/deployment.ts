import 'server-only';
import { z } from 'zod';
import { validateDatabaseTarget } from './supabase/database-target';

export class ForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class ConfigurationError extends ForbiddenError {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export type DeploymentMode = 'local' | 'private-network';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates the V0 deployment mode.
 * StackAudit V0 is strictly single-user, local-first.
 * Public, SaaS, or multi-tenant modes are explicitly rejected.
 */
export function validateDeploymentMode(
  mode: string | undefined = process.env.STACKAUDIT_DEPLOYMENT_MODE,
  allowPrivateNetwork: string | undefined = process.env.STACKAUDIT_ALLOW_PRIVATE_NETWORK
): DeploymentMode {
  const normalized = (mode ?? 'local').trim().toLowerCase();

  if (normalized === 'local') {
    return 'local';
  }

  if (normalized === 'private-network') {
    if (allowPrivateNetwork !== 'true') {
      throw new ConfigurationError(
        'Private network mode requires explicit confirmation via STACKAUDIT_ALLOW_PRIVATE_NETWORK=true. ' +
        'Ensure network isolation through a firewall or VPN; all reachable users within this boundary have operator access.'
      );
    }
    return 'private-network';
  }

  throw new ConfigurationError(
    `StackAudit V0 does not support public multi-tenant or SaaS deployment mode ('${mode}'). ` +
    'V0 is a single-user, local-first evidence ledger and must not be exposed as a public or shared multi-user service.'
  );
}

/**
 * Determines whether a given host string represents a loopback address.
 */
export function isLoopbackHost(host: string): boolean {
  let normalized = host.trim().toLowerCase();
  // Handle bracketed IPv6 with optional port: [::1]:8080 -> ::1
  if (normalized.startsWith('[') && normalized.includes(']')) {
    normalized = normalized.slice(1, normalized.indexOf(']'));
  } else {
    // Strip IPv4/hostname port only if single colon (e.g. 127.0.0.1:3000 or localhost:8080)
    // Avoid stripping IPv6 address components like ::1
    const colonCount = (normalized.match(/:/g) || []).length;
    if (colonCount === 1) {
      normalized = normalized.replace(/:\d+$/, '');
    }
  }

  return (
    normalized === '127.0.0.1' ||
    normalized === 'localhost' ||
    normalized === '::1'
  );
}

/**
 * Validates network host binding from environment configuration.
 *
 * NOTE: This function inspects process environment variables (HOST, HOSTNAME, STACKAUDIT_HOST).
 * It cannot directly inspect OS socket listener tables or flags passed directly to child processes.
 * Local-only security requires BOTH this environment-level safeguard AND explicitly passing
 * `-H 127.0.0.1` in the launch command (enforced by default in `npm run dev` and `npm start`).
 *
 * In `local` deployment mode, any non-loopback host (such as `0.0.0.0`, `::`, or LAN IP addresses
 * like `10.x.x.x`, `192.168.x.x`) is strictly prohibited.
 */
export function validateNetworkBinding(
  mode: DeploymentMode = validateDeploymentMode(),
  host: string | undefined = process.env.STACKAUDIT_HOST || process.env.HOST || process.env.HOSTNAME
): void {
  if (mode === 'local') {
    if (host && host.trim().length > 0 && !isLoopbackHost(host)) {
      throw new ConfigurationError(
        `Non-loopback host binding ('${host}') is prohibited in local deployment mode. ` +
        'Local execution must bind strictly to 127.0.0.1. ' +
        'To allow private-network access, explicitly configure STACKAUDIT_DEPLOYMENT_MODE=private-network with STACKAUDIT_ALLOW_PRIVATE_NETWORK=true and launch using the dedicated private-network command.'
      );
    }
  }
}

/**
 * Resolves and validates the explicitly configured workspace organization ID.
 * Supports STACKAUDIT_WORKSPACE_ORG_ID (canonical) or STACKAUDIT_ORG_ID.
 * Rejects ambiguous, missing, or malformed identifiers. Never falls back to arbitrary records.
 */
export function validateWorkspaceConfig(env: NodeJS.ProcessEnv = process.env): string {
  const orgId = env.STACKAUDIT_ORG_ID?.trim();
  const workspaceOrgId = env.STACKAUDIT_WORKSPACE_ORG_ID?.trim();

  if (orgId && workspaceOrgId && orgId !== workspaceOrgId) {
    throw new ConfigurationError(
      'Conflicting workspace identifiers: STACKAUDIT_ORG_ID and STACKAUDIT_WORKSPACE_ORG_ID cannot differ.'
    );
  }

  const id = orgId || workspaceOrgId;

  if (!id) {
    throw new ConfigurationError(
      'STACKAUDIT_WORKSPACE_ORG_ID is required. Set it to the organization ID for this local workspace.'
    );
  }

  if (!UUID_PATTERN.test(id)) {
    throw new ConfigurationError('STACKAUDIT_WORKSPACE_ORG_ID must be a valid UUID.');
  }

  return id;
}

/**
 * Comprehensive deployment and environment validation using Zod.
 */
export const deploymentEnvironmentSchema = z.object({
  STACKAUDIT_DEPLOYMENT_MODE: z.enum(['local', 'private-network']).default('local'),
  STACKAUDIT_ALLOW_PRIVATE_NETWORK: z.string().optional(),
  STACKAUDIT_WORKSPACE_ORG_ID: z.string().regex(UUID_PATTERN, 'Must be a valid UUID').optional(),
  STACKAUDIT_ORG_ID: z.string().regex(UUID_PATTERN, 'Must be a valid UUID').optional(),
  STACKAUDIT_DATABASE_MODE: z.enum(['local', 'remote']).default('local'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
}).refine(
  (data) => Boolean(data.STACKAUDIT_WORKSPACE_ORG_ID || data.STACKAUDIT_ORG_ID),
  { message: 'Either STACKAUDIT_WORKSPACE_ORG_ID or STACKAUDIT_ORG_ID is required' }
).refine(
  (data) => {
    if (data.STACKAUDIT_WORKSPACE_ORG_ID && data.STACKAUDIT_ORG_ID) {
      return data.STACKAUDIT_WORKSPACE_ORG_ID === data.STACKAUDIT_ORG_ID;
    }
    return true;
  },
  { message: 'STACKAUDIT_WORKSPACE_ORG_ID and STACKAUDIT_ORG_ID must match if both are set' }
).refine(
  (data) => {
    if (data.STACKAUDIT_DEPLOYMENT_MODE === 'private-network') {
      return data.STACKAUDIT_ALLOW_PRIVATE_NETWORK === 'true';
    }
    return true;
  },
  { message: 'Private network mode requires STACKAUDIT_ALLOW_PRIVATE_NETWORK=true' }
);

/**
 * Enforces all V0 deployment security boundaries on the server.
 */
export function validateDeploymentSecurity(env: NodeJS.ProcessEnv = process.env): {
  mode: DeploymentMode;
  workspaceId: string;
} {
  const mode = validateDeploymentMode(env.STACKAUDIT_DEPLOYMENT_MODE, env.STACKAUDIT_ALLOW_PRIVATE_NETWORK);
  validateNetworkBinding(mode, env.STACKAUDIT_HOST || env.HOST || env.HOSTNAME);
  const workspaceId = validateWorkspaceConfig(env);

  // If database credentials exist in the tested environment, validate database target consistency
  if (env.NEXT_PUBLIC_SUPABASE_URL) {
    validateDatabaseTarget(env.STACKAUDIT_DATABASE_MODE || 'local', env.NEXT_PUBLIC_SUPABASE_URL);
  }

  return { mode, workspaceId };
}
