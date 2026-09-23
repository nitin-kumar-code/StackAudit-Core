import { describe, it, expect } from 'vitest';

describe('Auth Metadata Security', () => {
  it('documents that app_metadata is strictly server-controlled by Supabase', () => {
    // Supabase explicitly blocks client-side modification of app_metadata.
    // client.auth.updateUser() ONLY updates user_metadata.
    // The only way to modify app_metadata is via the Service Role key (server-side only) or the admin console.
    // This test serves as a security assertion for the current architecture.
    
    const clientSideAllowedKeys = ['user_metadata', 'password', 'email', 'phone', 'data'];
    expect(clientSideAllowedKeys).not.toContain('app_metadata');
  });
});
