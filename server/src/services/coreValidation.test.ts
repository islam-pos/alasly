import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createEstimateApprovalToken, hashEstimateApprovalToken } from './estimateApprovalToken';
import { LoginAttemptLimiter } from './loginRateLimit';
import { parseOdometerReading } from './vehicleValidation';

test('odometer readings accept missing values and valid non-negative integers', () => {
  assert.equal(parseOdometerReading(undefined), null);
  assert.equal(parseOdometerReading('0'), 0);
  assert.equal(parseOdometerReading('123456'), 123456);
});

test('odometer readings reject negative, fractional, unsafe, and implausibly large values', () => {
  for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, 1_500_001]) {
    assert.throws(() => parseOdometerReading(value));
  }
});

test('estimate approval tokens are random and stored only as deterministic hashes', () => {
  const first = createEstimateApprovalToken();
  const second = createEstimateApprovalToken();

  assert.equal(first.length, 64);
  assert.notEqual(first, second);
  assert.equal(hashEstimateApprovalToken(first), hashEstimateApprovalToken(first));
  assert.notEqual(hashEstimateApprovalToken(first), first);
  assert.notEqual(hashEstimateApprovalToken(first), hashEstimateApprovalToken(second));
});

test('login attempts are throttled per key and reset after the configured window', () => {
  const limiter = new LoginAttemptLimiter(2, 1000);
  limiter.recordFailure('user', 100);
  assert.equal(limiter.check('user', 200).blocked, false);
  limiter.recordFailure('user', 300);
  assert.equal(limiter.check('user', 400).blocked, true);
  assert.equal(limiter.check('user', 1400).blocked, false);
});