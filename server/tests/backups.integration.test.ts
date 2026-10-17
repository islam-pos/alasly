import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { extract } from 'tar';

const enabled = process.env.RUN_BACKUP_INTEGRATION === '1';

test('creates and restores a database and attachment snapshot', { skip: !enabled }, async () => {
  const root = process.env.BACKUP_TEST_ROOT;
  assert.ok(root, 'BACKUP_TEST_ROOT is required for the integration test');
  const resolvedRoot = path.resolve(root);
  assert.equal(path.dirname(resolvedRoot), path.resolve(os.tmpdir()), 'test data must be directly under the OS temp directory');
  assert.ok(path.basename(resolvedRoot).startsWith('alasly-backup-smoke-'), 'test data directory name is not recognized');

  await fs.mkdir(resolvedRoot, { recursive: true });
  const dataDirectory = process.env.DATA_DIR;
  assert.equal(path.resolve(dataDirectory || ''), path.join(resolvedRoot, 'data'));
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl?.startsWith('file:'), 'DATABASE_URL must point to a temporary SQLite file');
  const databasePath = databaseUrl.slice('file:'.length);
  assert.equal(path.dirname(path.resolve(databasePath)), resolvedRoot);

  const { prisma } = await import('../src/lib/prisma');
  const backupService = await import('../src/services/backups');
  const { restorePendingBackup } = await import('../src/restoreBackup');
  const attachmentsDirectory = path.join(resolvedRoot, 'data', 'repair-attachments');
  const extractedDirectory = path.join(resolvedRoot, 'extracted');
  await fs.mkdir(attachmentsDirectory, { recursive: true });
  const attachmentPath = path.join(attachmentsDirectory, 'intake-photo.txt');
  await fs.writeFile(attachmentPath, 'before backup', 'utf8');

  try {
    await prisma.$executeRawUnsafe('CREATE TABLE "BackupSmoke" ("value" TEXT NOT NULL)');
    await prisma.$executeRawUnsafe('INSERT INTO "BackupSmoke" ("value") VALUES (?)', 'before backup');

    const backup = await backupService.createManualBackup();
    await fs.mkdir(extractedDirectory);
    await extract({ file: backupService.getBackupArchivePath(backup.id), cwd: extractedDirectory, strip: 1, strict: true });

    const snapshotClient = new PrismaClient({
      datasources: { db: { url: `file:${path.join(extractedDirectory, 'database.sqlite')}` } },
    });
    try {
      const snapshotRows = await snapshotClient.$queryRawUnsafe<{ value: string }[]>('SELECT "value" FROM "BackupSmoke"');
      assert.equal(snapshotRows[0].value, 'before backup');
      assert.equal(await fs.readFile(path.join(extractedDirectory, 'repair-attachments', 'intake-photo.txt'), 'utf8'), 'before backup');
    } finally {
      await snapshotClient.$disconnect();
    }

    await prisma.$executeRawUnsafe('UPDATE "BackupSmoke" SET "value" = ?', 'after backup');
    await fs.writeFile(attachmentPath, 'after backup', 'utf8');
    await backupService.queueBackupRestore(backup.id, 'integration-test');
    await prisma.$disconnect();
    await restorePendingBackup();
    await prisma.$connect();

    const restoredRows = await prisma.$queryRawUnsafe<{ value: string }[]>('SELECT "value" FROM "BackupSmoke"');
    assert.equal(restoredRows[0].value, 'before backup');
    assert.equal(await fs.readFile(attachmentPath, 'utf8'), 'before backup');
    assert.equal(await backupService.isRestorePending(), false);
  } finally {
    await prisma.$disconnect();
    await fs.rm(resolvedRoot, { recursive: true, force: true });
  }
});
