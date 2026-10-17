import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';

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

const toBase32 = (input: Buffer) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
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

export const createMfaSecret = () => toBase32(randomBytes(20));

export const createMfaOtpAuthUrl = async (username: string, secret: string) => {
  const label = encodeURIComponent(`Alasly ERP:${username}`);
  const url = `otpauth://totp/${label}?secret=${secret}&issuer=Alasly%20ERP&algorithm=SHA1&digits=6&period=30`;
  return { otpauthUrl: url, qrCodeDataUrl: await QRCode.toDataURL(url) };
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

export const createMfaSetupToken = (userId: string) =>
  jwt.sign({ sub: userId, purpose: 'mfa_setup' }, getSecret(), { expiresIn: '10m' });

export const readMfaSetupToken = (token: unknown) => {
  if (typeof token !== 'string') return null;
  try {
    const payload = jwt.verify(token, getSecret());
    if (
      typeof payload === 'string' ||
      payload.purpose !== 'mfa_setup' ||
      typeof payload.sub !== 'string'
    ) return null;
    return payload.sub;
  } catch {
    return null;
  }
};
