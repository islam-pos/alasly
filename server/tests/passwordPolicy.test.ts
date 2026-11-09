import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidPassword } from '../src/lib/passwordPolicy';

test('accepts alphanumeric passwords from 4 through 15 characters', () => {
  for (const password of ['Ab12', 'admin', 'Admin1234567890']) {
    assert.equal(isValidPassword(password), true);
  }
});

test('rejects passwords outside the length range or containing other characters', () => {
  for (const password of ['', 'Ab1', 'Admin12345678901', 'pass word', 'pass-word', 'رمز1234']) {
    assert.equal(isValidPassword(password), false);
  }
});
