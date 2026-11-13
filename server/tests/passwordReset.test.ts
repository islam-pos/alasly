import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPasswordResetToken,
  hashPasswordResetToken,
  isValidPasswordReset,
} from '../src/services/passwordReset';

test('creates unique URL-safe reset tokens and stores only deterministic hashes', () => {
  const first = createPasswordResetToken();
  const second = createPasswordResetToken();

  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
  assert.equal(hashPasswordResetToken(first), hashPasswordResetToken(first));
  assert.notEqual(hashPasswordResetToken(first), first);
  assert.notEqual(hashPasswordResetToken(first), hashPasswordResetToken(second));
});

test('rejects the known weak admin password for recovery', () => {
  assert.equal(isValidPasswordReset('admin'), false);
  assert.equal(isValidPasswordReset('ADMIN'), false);
  assert.equal(isValidPasswordReset('GoodPass12345'), true);
  assert.equal(isValidPasswordReset('Ab12'), false);
  assert.equal(isValidPasswordReset(undefined), false);
});