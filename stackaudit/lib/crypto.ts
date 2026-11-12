import crypto from 'crypto';

// Use a 32-byte key from env, or a deterministic fallback for testing ONLY
export function getEncryptionKey(): Buffer {
  const envKey = process.env.WEBHOOK_ENCRYPTION_KEY;
  if (envKey) {
    if (!/^[0-9a-f]{64}$/i.test(envKey)) {
      throw new Error('WEBHOOK_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).');
    }
    return Buffer.from(envKey, 'hex');
  }
  return crypto.scryptSync('fallback-dev-key', 'salt', 32);
}

const ALGORITHM = 'aes-256-gcm';

export function encryptSecret(text: string): string {
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
