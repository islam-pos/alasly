import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getRequiredPermissions } from '../src/middleware/permissions';

test('workshop part request permissions separate requesting and issuing', () => {
  assert.deepEqual(getRequiredPermissions('/workshop/parts/requests', 'GET'), [
    'manage_workshop', 'manage_jobcards', 'issue_parts', 'manage_inventory',
  ]);
  assert.deepEqual(getRequiredPermissions('/workshop/parts/requests', 'POST'), [
    'manage_workshop', 'manage_jobcards',
  ]);
  assert.deepEqual(getRequiredPermissions('/workshop/job-cards/repair-id/parts/issue', 'POST'), [
    'issue_parts', 'manage_inventory',
  ]);
});

test('estimate approval and job-card reads retain dedicated access rules', () => {
  assert.deepEqual(getRequiredPermissions('/workshop/job-cards/repair-id/estimate/estimate-id/approve', 'POST'), [
    'approve_estimate',
  ]);
  assert.deepEqual(getRequiredPermissions('/workshop/job-cards', 'GET'), [
    'manage_workshop', 'manage_jobcards', 'issue_parts', 'manage_inventory',
  ]);
});

test('unknown endpoints do not gain an implicit permission rule', () => {
  assert.equal(getRequiredPermissions('/unmapped-endpoint', 'GET'), null);
});
