import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getBackupsToPrune,
  getCairoDateKey,
  isSafeBackupId,
  parseBackupName,
  resolveDatabaseFile,
} from '../src/services/backups';

const backupId = (type: 'daily' | 'manual', date: string, sequence: number) =>
  `autocare-${type}-${date}-20261017T1200${String(sequence).padStart(2, '0')}Z-00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}.tar.gz`;

test('resolves SQLite paths relative to the Prisma schema directory', () => {
  assert.equal(
    resolveDatabaseFile('file:./autocare.db', 'C:\\app\\server'),
    'C:\\app\\server\\prisma\\autocare.db',
  );
  assert.equal(
    resolveDatabaseFile('file:/data/autocare.db', 'C:\\app\\server'),
    '\\data\\autocare.db',
  );
});

test('rejects non-file and in-memory database URLs', () => {
  assert.throws(() => resolveDatabaseFile('postgresql://example/db'), /SQLite file/);
  assert.throws(() => resolveDatabaseFile('file::memory:'), /In-memory/);
});

test('accepts only generated backup archive names', () => {
  const id = backupId('daily', '2026-10-17', 1);
  assert.equal(isSafeBackupId(id), true);
  assert.equal(parseBackupName(id)?.kind, 'daily');
  assert.equal(isSafeBackupId('../database.sqlite'), false);
  assert.equal(isSafeBackupId('autocare-daily-2026-10-17-invalid.tar.gz'), false);
});

test('retains newest daily and manual backups in separate limits', () => {
  const backups = [
    ...Array.from({ length: 32 }, (_, index) => ({
      id: backupId('daily', '2026-10-17', index + 1),
      type: 'daily',
      date: new Date(2026, 9, 17, 0, 0, index).toISOString(),
      sizeBytes: 100,
    })),
    ...Array.from({ length: 12 }, (_, index) => ({
      id: backupId('manual', '2026-10-17', index + 40),
      type: 'manual',
      date: new Date(2026, 9, 17, 1, 0, index).toISOString(),
      sizeBytes: 100,
    })),
  ];
  const pruned = getBackupsToPrune(backups);
  assert.equal(pruned.length, 4);
  assert.equal(pruned.filter((id) => id.includes('-daily-')).length, 2);
  assert.equal(pruned.filter((id) => id.includes('-manual-')).length, 2);
});

test('uses the Cairo calendar date for scheduled backup grouping', () => {
  assert.equal(getCairoDateKey(new Date('2026-10-17T22:30:00.000Z')), '2026-10-18');
});
