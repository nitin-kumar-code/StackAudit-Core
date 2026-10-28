import crypto from 'crypto';

// Use a 32-byte key from env, or a deterministic fallback for testing ONLY
const ENCRYPTION_KEY = process.env.WEBHOOK_ENCRYPTION_KEY 
  ? Buffer.from(process.env.WEBHOOK_ENCRYPTION_KEY, 'hex')
  : crypto.scryptSync('fallback-dev-key', 'salt', 32);

const ALGORITHM = 'aes-256-gcm';

export function encryptSecret(text: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  
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
    const [ivHex, authTagHex, encryptedText] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch {
    throw new Error('Failed to decrypt webhook secret');
  }
}
