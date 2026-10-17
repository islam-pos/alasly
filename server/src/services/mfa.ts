import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error('JWT_SECRET must contain at least 32 bytes');
  return secret;
};

const getEncryptionKey = () => {
  const configured = process.env.MFA_ENCRYPTION_KEY || getSecret();
  if (Buffer.byteLength(configured) < 32) throw new Error('MFA_ENCRYPTION_KEY must contain at least 32 bytes');
  return createHash('sha256').update(`alasly-admin-mfa:${configured}`).digest();
};

const fromBase32 = (input: string) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const character of input.replace(/=+$/g, '').toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error('Authenticator secret is invalid');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
};

export const verifyMfaCode = (secret: string, code: unknown, now = Date.now()) => {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return false;
  const key = fromBase32(secret);
  const candidate = Buffer.from(code);
  for (const windowOffset of [-1, 0, 1]) {
    const counter = Math.floor(now / 30_000) + windowOffset;
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter));
    const digest = createHmac('sha1', key).update(counterBuffer).digest();
    const offset = digest[digest.length - 1] & 15;
    const binary = ((digest[offset] & 127) << 24)
      | ((digest[offset + 1] & 255) << 16)
      | ((digest[offset + 2] & 255) << 8)
      | (digest[offset + 3] & 255);
    const expected = Buffer.from(String(binary % 1_000_000).padStart(6, '0'));
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) return true;
  }
  return false;
};

export const encryptMfaSecret = (secret: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
};

export const decryptMfaSecret = (encrypted: string) => {
  const data = Buffer.from(encrypted, 'base64');
  if (data.length < 29) throw new Error('Stored authenticator secret is invalid');
  const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
};
