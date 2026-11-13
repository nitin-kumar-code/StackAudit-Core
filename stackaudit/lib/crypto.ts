import crypto from 'crypto';

function isTestEnvironment(): boolean {
  return process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
}

/**
 * Returns true if a valid 64-character hexadecimal WEBHOOK_ENCRYPTION_KEY is configured.
 */
export function hasEncryptionKey(): boolean {
  const envKey = process.env.WEBHOOK_ENCRYPTION_KEY;
  if (!envKey) return false;
  return /^[0-9a-f]{64}$/i.test(envKey);
}

/**
 * Returns the 32-byte encryption key buffer.
 *
 * FAIL-CLOSED: Outside automated test suites, WEBHOOK_ENCRYPTION_KEY must be set to a 64-character hex string.
 * A hard-coded fallback key is NEVER used in development or production.
 * In automated test execution, an ephemeral test-only key is used when WEBHOOK_ENCRYPTION_KEY is unset.
 */
export function getEncryptionKey(): Buffer {
  const envKey = process.env.WEBHOOK_ENCRYPTION_KEY;
  if (envKey) {
    if (!/^[0-9a-f]{64}$/i.test(envKey)) {
      throw new Error('WEBHOOK_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).');
    }
    return Buffer.from(envKey, 'hex');
  }

  if (isTestEnvironment()) {
    return crypto.scryptSync('ephemeral-test-suite-key', 'test-salt', 32);
  }

  throw new Error(
    'WEBHOOK_ENCRYPTION_KEY is required for webhook encryption. ' +
    'Provide a 64-character hexadecimal key (32 bytes) in .env.local.'
  );
}

const ALGORITHM = 'aes-256-gcm';

export function encryptSecret(text: string): string {
  if (!hasEncryptionKey() && !isTestEnvironment()) {
    throw new Error(
      'Cannot encrypt webhook secret: WEBHOOK_ENCRYPTION_KEY is not configured. ' +
      'Set a 64-character hex key in .env.local before storing encrypted secrets.'
    );
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  
  // Format: iv:authTag:encryptedText
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptSecret(encryptedData: string): string {
  if (!encryptedData.includes(':')) {
    // Fallback for unencrypted legacy secrets
    return encryptedData;
  }

  if (!hasEncryptionKey() && !isTestEnvironment()) {
    throw new Error(
      'Failed to decrypt webhook secret: WEBHOOK_ENCRYPTION_KEY is not configured.'
    );
  }
  
  try {
    const key = getEncryptionKey();
    const [ivHex, authTagHex, encryptedText] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch {
    throw new Error('Failed to decrypt webhook secret');
  }
}
