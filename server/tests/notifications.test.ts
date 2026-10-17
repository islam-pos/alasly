import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getNotificationRetryDelayMs } from '../src/services/notificationRetry';

test('notification retries use exponential backoff capped at one day', () => {
  assert.equal(getNotificationRetryDelayMs(1), 30_000);
  assert.equal(getNotificationRetryDelayMs(2), 60_000);
  assert.equal(getNotificationRetryDelayMs(4), 240_000);
  assert.equal(getNotificationRetryDelayMs(100), 24 * 60 * 60 * 1000);
  assert.equal(getNotificationRetryDelayMs(Number.NaN), 30_000);
});
