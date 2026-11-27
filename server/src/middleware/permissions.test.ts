import assert from 'node:assert/strict';
import test from 'node:test';
import { getRequiredPermissions } from './permissions';

test('workshop employee lookup requires workshop access and does not expose the full HR endpoint', () => {
  assert.deepEqual(getRequiredPermissions('/master/workshop-employees', 'GET'), ['manage_workshop']);
  assert.deepEqual(getRequiredPermissions('/master/employees', 'GET'), ['manage_employees']);
});

test('assistant has no business-data permission requirement beyond global authentication', () => {
  assert.equal(getRequiredPermissions('/assistant/chat', 'POST'), null);
});
