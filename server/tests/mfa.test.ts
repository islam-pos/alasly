import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  decryptMfaSecret,
  encryptMfaSecret,
  verifyMfaCode,
} from '../src/services/mfa';

const rfcSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

test('TOTP verification accepts RFC 6238 SHA-1 six-digit vectors and rejects invalid codes', () => {
  assert.equal(verifyMfaCode(rfcSecret, '287082', 59_000), true);
  assert.equal(verifyMfaCode(rfcSecret, '081804', 1_111_111_109_000), true);
  assert.equal(verifyMfaCode(rfcSecret, '000000', 59_000), false);
  assert.equal(verifyMfaCode(rfcSecret, '287082x', 59_000), false);
});

test('MFA secret storage uses authenticated encryption', () => {
  process.env.JWT_SECRET = 'test-secret-that-is-longer-than-thirty-two-bytes';
  const encrypted = encryptMfaSecret(rfcSecret);
  assert.equal(decryptMfaSecret(encrypted), rfcSecret);
  const tampered = Buffer.from(encrypted, 'base64');
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => decryptMfaSecret(tampered.toString('base64')));
});
